import { writeAuditLog } from "@/lib/audit-log";
import {
  getIncludedMemberLimit,
  getIncludedRecordingHours,
  getWorkspaceActiveMemberCount,
  getWorkspaceRecordingSecondsThisPeriod,
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
  // Skip Free (no overages) and Enterprise (custom billing)
  if (!workspace || workspace.plan === "FREE" || workspace.plan === "ENTERPRISE") return;

  const customerId = invoice.customer as string;
  let extraMembers = 0;
  let extraHours = 0;

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

      // Stripe 2026 dahlia API: price reference is nested under `pricing`
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        pricing: { price: memberOveragePriceId },
        quantity: extraMembers,
        description: `${extraMembers} extra member${extraMembers > 1 ? "s" : ""} beyond ${includedMembers} included`,
      });
    }
  } catch (err) {
    // Log but don't abort — recording overage should still be attempted
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

  if (extraMembers > 0 || extraHours > 0) {
    void writeAuditLog({
      action: "BILLING_OVERAGE_CHARGED",
      workspaceId,
      metadata: { extraMembers, extraHours, invoiceId: invoice.id },
    });
  }
}
