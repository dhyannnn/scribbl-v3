import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { sendCancellationEmail, sendPaymentFailedEmail } from "@/lib/email/billing-emails";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createStorageOverageSubscriptionIfNeeded } from "@/lib/stripe-overage";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  // Idempotency guard — Stripe retries on network failure; prevent double-processing
  try {
    await prisma.stripeEventLog.create({ data: { eventId: event.id } });
  } catch {
    // Unique constraint violation = already processed
    return new Response("ok", { status: 200 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        // Don't sync storage-overage-only subscriptions into the main plan field
        if (subscription.metadata?.type === "storage-overage-only") break;
        await syncSubscription(subscription, null);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        // Storage-overage-only subscriptions ending don't affect the workspace plan
        if (subscription.metadata?.type === "storage-overage-only") break;
        await cancelSubscription(subscription);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const parent = session.subscription;
        if (parent) {
          const subscriptionId = typeof parent === "string" ? parent : parent;
          const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
          await syncSubscription(sub, null);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const parent = invoice.parent as (Stripe.Invoice.Parent & { subscription_details?: { subscription?: string | Stripe.Subscription } }) | null;
        const subscriptionId = parent?.subscription_details?.subscription;
        if (subscriptionId) {
          const sid = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;
          const subscription = await stripe.subscriptions.retrieve(sid);
          if (subscription.metadata?.type !== "storage-overage-only") {
            await syncSubscription(subscription, invoice.period_end ?? null);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const parent = invoice.parent as (Stripe.Invoice.Parent & { subscription_details?: { subscription?: string | Stripe.Subscription } }) | null;
        const subscriptionId = parent?.subscription_details?.subscription;
        if (subscriptionId) {
          const sid = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;
          const sub = await prisma.subscription.findFirst({
            where: { stripeSubscriptionId: sid },
            select: { workspaceId: true, workspace: { select: { name: true } } },
          });
          await prisma.subscription.updateMany({
            where: { stripeSubscriptionId: sid },
            data: { status: "PAST_DUE" },
          });
          await writeAuditLog({
            action: "BILLING_PAYMENT_FAILED",
            workspaceId: sub?.workspaceId,
            targetId: sid,
            metadata: { stripeSubscriptionId: sid },
          });
          // Email the workspace owner
          if (sub?.workspaceId) {
            const owner = await getWorkspaceOwner(sub.workspaceId);
            const appUrl = process.env.APP_URL ?? "http://localhost:3000";
            if (owner) {
              void sendPaymentFailedEmail({
                to: owner.email,
                workspaceName: sub.workspace?.name ?? "your workspace",
                manageUrl: `${appUrl}/workspaces/${sub.workspaceId}/billing`,
              }).catch((err) => console.error("[stripe webhook] sendPaymentFailedEmail failed", err));
            }
          }
        }
        break;
      }

      case "invoice.created": {
        const invoice = event.data.object as Stripe.Invoice;
        const { handleInvoiceCreated } = await import("@/lib/stripe-overage");
        await handleInvoiceCreated(invoice);
        break;
      }
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function syncSubscription(subscription: Stripe.Subscription, periodEnd: number | null) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);
  const status = mapStripeStatus(subscription.status);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPeriodStart = (subscription as any).current_period_start;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPeriodEnd = (subscription as any).current_period_end;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existing) return;

  const oldPlan = existing.plan;

  await prisma.subscription.update({
    where: { id: existing.id },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      plan,
      status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      ...(rawPeriodStart ? { currentPeriodStart: new Date(rawPeriodStart * 1000) } : {}),
      ...(rawPeriodEnd ? { currentPeriodEnd: new Date(rawPeriodEnd * 1000) } : {}),
    },
  });

  if (existing.workspaceId) {
    await prisma.workspace.update({
      where: { id: existing.workspaceId },
      data: { plan },
    });
  }

  if (existing.organizationId) {
    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: { plan, ...(currentPeriodEnd ? { currentPeriodEnd } : {}) },
    });
    await prisma.workspace.updateMany({
      where: { organizationId: existing.organizationId },
      data: { plan },
    });
  }

  if (oldPlan !== plan) {
    await writeAuditLog({
      action: "BILLING_UPGRADED",
      workspaceId: existing.workspaceId,
      targetId: subscription.id,
      metadata: { oldPlan, newPlan: plan, stripeSubscriptionId: subscription.id },
    });
  }
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const existing = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    include: { workspace: { select: { name: true } } },
  });

  if (!existing) return;

  const previousPlan = existing.plan;

  await prisma.subscription.update({
    where: { id: existing.id },
    data: { plan: "FREE", status: "CANCELED", stripeSubscriptionId: null },
  });

  if (existing.workspaceId) {
    await prisma.workspace.update({
      where: { id: existing.workspaceId },
      data: { plan: "FREE" },
    });

    // Create a storage-overage subscription if they're over the Free limit
    await createStorageOverageSubscriptionIfNeeded(customerId, existing.workspaceId);
  }

  if (existing.organizationId) {
    await prisma.organization.update({
      where: { id: existing.organizationId },
      data: { plan: "FREE", currentPeriodEnd: null },
    });
    await prisma.workspace.updateMany({
      where: { organizationId: existing.organizationId },
      data: { plan: "FREE" },
    });
  }

  await writeAuditLog({
    action: "BILLING_CANCELED",
    workspaceId: existing.workspaceId,
    targetId: subscription.id,
    metadata: { stripeSubscriptionId: subscription.id, previousPlan },
  });

  // Email the workspace owner
  if (existing.workspaceId) {
    const owner = await getWorkspaceOwner(existing.workspaceId);
    if (owner) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const periodEnd = (subscription as any).current_period_end;
      void sendCancellationEmail({
        to: owner.email,
        workspaceName: existing.workspace?.name ?? "your workspace",
        planName: previousPlan.charAt(0) + previousPlan.slice(1).toLowerCase(),
        periodEnd: periodEnd ? new Date(periodEnd * 1000) : undefined,
      }).catch((err) => console.error("[stripe webhook] sendCancellationEmail failed", err));
    }
  }
}

async function getWorkspaceOwner(workspaceId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER", status: "ACTIVE" },
    select: { user: { select: { email: true } } },
  });
  return member?.user ?? null;
}

function getPlanFromPriceId(priceId: string | undefined) {
  if (priceId === process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD) return "INSTITUTION" as const;
  if (priceId === process.env.STRIPE_PRICE_PRO_BASE_CAD) return "PRO" as const;
  return "FREE" as const;
}

function mapStripeStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case "active":   return "ACTIVE" as const;
    case "trialing": return "TRIALING" as const;
    case "past_due": return "PAST_DUE" as const;
    case "canceled": return "CANCELED" as const;
    default:         return "INCOMPLETE" as const;
  }
}
