import { writeAuditLog } from "@/lib/audit-log";
import {
  FREE_SHARED_STORAGE_BYTES,
  getIncludedMemberLimit,
  getIncludedRecordingHours,
  getSharedStorageLimitBytes,
  getStorageOverageGB,
  getWorkspaceActiveMemberCount,
  getWorkspaceRecordingSecondsThisPeriod,
  getWorkspaceSharedStorageBytes,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  const parent = invoice.parent as (Stripe.Invoice.Parent & {
    subscription_details?: { subscription?: string | Stripe.Subscription };
  }) | null;
  const subscriptionRef = parent?.subscription_details?.subscription;
  if (!subscriptionRef) return;

  const subscriptionId =
    typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId) as any;

  // ── Storage-overage-only subscription (Free workspaces post-downgrade) ──────
  if (stripeSub.metadata?.type === "storage-overage-only") {
    const workspaceId = stripeSub.metadata?.workspaceId as string | undefined;
    if (!workspaceId) return;

    const usedBytes = await getWorkspaceSharedStorageBytes(workspaceId);
    const newOverageGB = getStorageOverageGB(usedBytes, FREE_SHARED_STORAGE_BYTES);

    if (newOverageGB === 0) {
      // No more overage — cancel the subscription so they stop being charged
      await stripe.subscriptions.cancel(subscriptionId);
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { stripeSubscriptionId: null },
      });
      return;
    }

    // Update quantity to reflect current overage before invoice finalises
    const itemId = stripeSub.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptionItems.update(itemId, { quantity: newOverageGB });
    }
    return;
  }

  // Prefer metadata on the Stripe subscription. Fall back to our DB for
  // subscriptions created before subscription_data.metadata was set in checkout.
  let workspaceId = stripeSub.metadata?.workspaceId as string | undefined;
  if (!workspaceId) {
    const sub = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { workspaceId: true },
    });
    workspaceId = sub?.workspaceId ?? undefined;
  }
  if (!workspaceId) return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, plan: true },
  });
  // Skip Free (no overages here — handled by overage-only sub above) and Enterprise (custom billing)
  if (!workspace || workspace.plan === "FREE" || workspace.plan === "ENTERPRISE") return;

  const customerId = invoice.customer as string;
  let extraMembers = 0;
  let extraHours = 0;
  let extraStorageGB = 0;

  // ── Member overage ──────────────────────────────────────────────────────────
  try {
    const memberCount = await getWorkspaceActiveMemberCount(workspaceId);
    const includedMembers = getIncludedMemberLimit(workspace.plan);
    extraMembers = Math.max(0, memberCount - includedMembers);

    if (extraMembers > 0) {
      const memberOveragePriceId =
        workspace.plan === "INSTITUTION"
          ? process.env.STRIPE_PRICE_INSTITUTION_MEMBER_OVERAGE_CAD!
          : process.env.STRIPE_PRICE_PRO_MEMBER_OVERAGE_CAD!;

      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        pricing: { price: memberOveragePriceId },
        quantity: extraMembers,
        description: `${extraMembers} extra member${extraMembers > 1 ? "s" : ""} beyond ${includedMembers} included`,
      });
    }
  } catch (err) {
    console.error("[stripe-overage] member overage item failed", workspaceId, err);
    extraMembers = 0;
  }

  // ── Recording overage ───────────────────────────────────────────────────────
  try {
    const billingPeriodStart = new Date(stripeSub.current_period_start * 1000);
    const recordingSeconds = await getWorkspaceRecordingSecondsThisPeriod(workspaceId, billingPeriodStart);
    const usedHours = recordingSeconds / 3600;
    const includedHours = getIncludedRecordingHours(workspace.plan);
    extraHours = Math.max(0, Math.ceil(usedHours - includedHours));

    if (extraHours > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        pricing: { price: process.env.STRIPE_PRICE_RECORDING_OVERAGE_CAD! },
        quantity: extraHours,
        description: `${extraHours} recording hour${extraHours > 1 ? "s" : ""} beyond ${includedHours} included`,
      });
    }
  } catch (err) {
    console.error("[stripe-overage] recording overage item failed", workspaceId, err);
    extraHours = 0;
  }

  // ── Storage overage ─────────────────────────────────────────────────────────
  try {
    if (process.env.STRIPE_PRICE_STORAGE_OVERAGE_CAD) {
      const usedBytes = await getWorkspaceSharedStorageBytes(workspaceId);
      const limitBytes = getSharedStorageLimitBytes(workspace.plan);
      extraStorageGB = getStorageOverageGB(usedBytes, limitBytes);

      if (extraStorageGB > 0) {
        await stripe.invoiceItems.create({
          customer: customerId,
          invoice: invoice.id,
          pricing: { price: process.env.STRIPE_PRICE_STORAGE_OVERAGE_CAD },
          quantity: extraStorageGB,
          description: `${extraStorageGB} GB shared storage overage`,
        });
      }
    }
  } catch (err) {
    console.error("[stripe-overage] storage overage item failed", workspaceId, err);
    extraStorageGB = 0;
  }

  if (extraMembers > 0 || extraHours > 0 || extraStorageGB > 0) {
    void writeAuditLog({
      action: "BILLING_OVERAGE_CHARGED",
      workspaceId,
      metadata: { extraMembers, extraHours, extraStorageGB, invoiceId: invoice.id },
    });
  }
}

// Creates a storage-overage-only recurring subscription for Free workspaces that
// have more data stored than the Free limit allows. Called when a paid workspace
// is cancelled or downgraded to Free.
export async function createStorageOverageSubscriptionIfNeeded(
  customerId: string,
  workspaceId: string,
): Promise<string | null> {
  if (!process.env.STRIPE_PRICE_STORAGE_OVERAGE_CAD) return null;

  const usedBytes = await getWorkspaceSharedStorageBytes(workspaceId);
  const overageGB = getStorageOverageGB(usedBytes, FREE_SHARED_STORAGE_BYTES);
  if (overageGB === 0) return null;

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_STORAGE_OVERAGE_CAD, quantity: overageGB }],
    metadata: { workspaceId, type: "storage-overage-only" },
  });

  await prisma.subscription.updateMany({
    where: { workspaceId },
    data: { stripeSubscriptionId: sub.id },
  });

  await writeAuditLog({
    action: "BILLING_OVERAGE_CHARGED",
    workspaceId,
    metadata: { extraStorageGB: overageGB, reason: "storage-overage-subscription-created" },
  });

  return sub.id;
}
