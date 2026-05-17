import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import type { SubscriptionPlan } from "@prisma/client";

export const FREE_MEMBER_LIMIT = 5;
export const FREE_WORKSPACE_LIMIT = 3;
export const FREE_STORAGE_BYTES = 500 * 1024 * 1024;        // 500 MB
export const PRO_STORAGE_BYTES  = 10 * 1024 * 1024 * 1024;  // 10 GB

export async function getWorkspacePlan(workspaceId: string): Promise<SubscriptionPlan> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  return workspace?.plan ?? "FREE";
}

export async function getWorkspaceActiveMemberCount(workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({
    where: { workspaceId, status: "ACTIVE" },
  });
}

// Sum of all file sizeBytes for a workspace — used to enforce storage limits.
// Approximation: doesn't include images embedded inline in notes, but close enough for launch.
export async function getWorkspaceStorageBytes(workspaceId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { workspaceId },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}

export function getStorageLimitBytes(plan: SubscriptionPlan): number {
  if (plan === "FREE") return FREE_STORAGE_BYTES;
  return PRO_STORAGE_BYTES;
}

// Count workspaces owned by a user (any plan).
export async function getOwnedWorkspaceCount(userId: string): Promise<number> {
  return prisma.workspaceMember.count({
    where: { userId, role: "OWNER", status: "ACTIVE" },
  });
}

// Returns true if the user has at least one paid (non-FREE) workspace.
export async function userHasPaidWorkspace(userId: string): Promise<boolean> {
  const count = await prisma.workspace.count({
    where: {
      plan: { not: "FREE" },
      members: { some: { userId, role: "OWNER", status: "ACTIVE" } },
    },
  });
  return count > 0;
}

// Re-sync workspace plan from Stripe in case a webhook was missed.
// Handles the case where stripeSubscriptionId is null (webhook never fired after checkout).
export async function syncWorkspacePlanFromStripe(workspaceId: string): Promise<SubscriptionPlan> {
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: { id: true, stripeCustomerId: true, stripeSubscriptionId: true, plan: true },
  });

  if (!subscription?.stripeCustomerId) {
    return "FREE";
  }

  try {
    let stripeSub: Stripe.Subscription | null = null;

    if (subscription.stripeSubscriptionId) {
      stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    } else {
      // Webhook never fired — look up the customer's subscriptions directly
      const list = await stripe.subscriptions.list({
        customer: subscription.stripeCustomerId,
        status: "all",
        limit: 1,
      });
      stripeSub = list.data[0] ?? null;
    }

    if (!stripeSub) {
      return subscription.plan;
    }

    const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";
    const priceId = stripeSub.items.data[0]?.price.id;
    const plan: SubscriptionPlan = isActive ? planFromPriceId(priceId) : "FREE";

    const oldPlan = subscription.plan;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        plan,
        status: isActive ? "ACTIVE" : "CANCELED",
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { plan },
    });

    if (oldPlan !== plan) {
      await writeAuditLog({
        action: plan === "FREE" ? "BILLING_CANCELED" : "BILLING_UPGRADED",
        workspaceId,
        targetId: stripeSub.id,
        metadata: { oldPlan, newPlan: plan, source: "manual_sync" },
      });
    }

    return plan;
  } catch {
    return subscription.plan;
  }
}

function planFromPriceId(priceId: string | undefined): SubscriptionPlan {
  if (priceId === process.env.STRIPE_INSTITUTION_PRICE_ID) return "INSTITUTION";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  return "FREE";
}
