import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";
import type { SubscriptionPlan } from "@prisma/client";

// ── Workspace limits ──────────────────────────────────────────────────────────
export const FREE_WORKSPACE_LIMIT = 1
export const FREE_MEMBER_LIMIT    = 3

// ── Pro limits ────────────────────────────────────────────────────────────────
export const PRO_MEMBER_LIMIT              = 20
export const PRO_MEMBER_OVERAGE_CAD        = 1.00
export const PRO_RECORDING_HOURS           = 5
export const PRO_RECORDING_OVERAGE_CAD     = 1.50

// ── Institution limits ────────────────────────────────────────────────────────
export const INSTITUTION_MEMBER_LIMIT             = 50
export const INSTITUTION_MEMBER_OVERAGE_CAD       = 0.50
export const INSTITUTION_RECORDING_HOURS          = 20
export const INSTITUTION_RECORDING_OVERAGE_CAD    = 1.50

// ── Shared storage limits (WORKSPACE_SHARED files only) ───────────────────────
export const FREE_SHARED_STORAGE_BYTES        = 500  * 1024 * 1024           //  500 MB
export const PRO_SHARED_STORAGE_BYTES         = 10   * 1024 * 1024 * 1024    //   10 GB
export const INSTITUTION_SHARED_STORAGE_BYTES = 50   * 1024 * 1024 * 1024    //   50 GB
export const ENTERPRISE_SHARED_STORAGE_BYTES  = 200  * 1024 * 1024 * 1024    //  200 GB

// ── Private storage limits (per user, PRIVATE files) ─────────────────────────
export const FREE_PRIVATE_STORAGE_BYTES_PER_USER        = 200 * 1024 * 1024          //  200 MB
export const PRO_PRIVATE_STORAGE_BYTES_PER_USER         = 2   * 1024 * 1024 * 1024   //    2 GB
export const INSTITUTION_PRIVATE_STORAGE_BYTES_PER_USER = 5   * 1024 * 1024 * 1024   //    5 GB
export const ENTERPRISE_PRIVATE_STORAGE_BYTES_PER_USER  = 10  * 1024 * 1024 * 1024   //   10 GB

// ── Plan helpers ──────────────────────────────────────────────────────────────

export function getSharedStorageLimitBytes(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":         return PRO_SHARED_STORAGE_BYTES;
    case "INSTITUTION": return INSTITUTION_SHARED_STORAGE_BYTES;
    case "ENTERPRISE":  return ENTERPRISE_SHARED_STORAGE_BYTES;
    default:            return FREE_SHARED_STORAGE_BYTES;
  }
}

export function getPrivateStorageLimitPerUserBytes(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":         return PRO_PRIVATE_STORAGE_BYTES_PER_USER;
    case "INSTITUTION": return INSTITUTION_PRIVATE_STORAGE_BYTES_PER_USER;
    case "ENTERPRISE":  return ENTERPRISE_PRIVATE_STORAGE_BYTES_PER_USER;
    default:            return FREE_PRIVATE_STORAGE_BYTES_PER_USER;
  }
}

export function getIncludedMemberLimit(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":         return PRO_MEMBER_LIMIT;
    case "INSTITUTION": return INSTITUTION_MEMBER_LIMIT;
    case "ENTERPRISE":  return Infinity;
    default:            return FREE_MEMBER_LIMIT;
  }
}

export function getIncludedRecordingHours(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":         return PRO_RECORDING_HOURS;
    case "INSTITUTION": return INSTITUTION_RECORDING_HOURS;
    case "ENTERPRISE":  return Infinity;
    default:            return 0;
  }
}

export function getMemberOverageRateCad(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":         return PRO_MEMBER_OVERAGE_CAD;
    case "INSTITUTION": return INSTITUTION_MEMBER_OVERAGE_CAD;
    default:            return 0;
  }
}

export function getRecordingOverageRateCad(plan: SubscriptionPlan): number {
  switch (plan) {
    case "PRO":
    case "INSTITUTION": return PRO_RECORDING_OVERAGE_CAD;
    default:            return 0;
  }
}

// ── Storage overage helper ────────────────────────────────────────────────────

export function getStorageOverageGB(usedBytes: number, limitBytes: number): number {
  const overBytes = Math.max(0, usedBytes - limitBytes);
  return Math.ceil(overBytes / (1024 * 1024 * 1024));
}

// ── Storage queries ───────────────────────────────────────────────────────────

// Sums WORKSPACE_SHARED files only — used for workspace shared storage gating
export async function getWorkspaceSharedStorageBytes(workspaceId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { workspaceId, visibility: "WORKSPACE_SHARED" },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}

// Sums PRIVATE files for a specific user in a workspace
export async function getUserPrivateStorageBytes(userId: string, workspaceId: string): Promise<number> {
  const result = await prisma.file.aggregate({
    where: { workspaceId, uploadedByUserId: userId, visibility: "PRIVATE" },
    _sum: { sizeBytes: true },
  });
  return result._sum.sizeBytes ?? 0;
}

// Total recording seconds used in the current billing period
export async function getWorkspaceRecordingSecondsThisPeriod(
  workspaceId: string,
  billingPeriodStart: Date,
): Promise<number> {
  const result = await prisma.meetingRecording.aggregate({
    where: {
      meeting: { workspaceId },
      status: "COMPLETED",
      startedAt: { gte: billingPeriodStart },
      durationSeconds: { not: null },
    },
    _sum: { durationSeconds: true },
  });
  return result._sum.durationSeconds ?? 0;
}

// ── Workspace / user queries ──────────────────────────────────────────────────

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

export async function getOwnedWorkspaceCount(userId: string): Promise<number> {
  return prisma.workspaceMember.count({
    where: { userId, role: "OWNER", status: "ACTIVE" },
  });
}

export async function userHasPaidWorkspace(userId: string): Promise<boolean> {
  const count = await prisma.workspace.count({
    where: {
      plan: { not: "FREE" },
      members: { some: { userId, role: "OWNER", status: "ACTIVE" } },
    },
  });
  return count > 0;
}

// ── Backward compat aliases ───────────────────────────────────────────────────

/** @deprecated Use getWorkspaceSharedStorageBytes */
export async function getWorkspaceStorageBytes(workspaceId: string): Promise<number> {
  return getWorkspaceSharedStorageBytes(workspaceId);
}

/** @deprecated Use getSharedStorageLimitBytes */
export function getStorageLimitBytes(plan: SubscriptionPlan): number {
  return getSharedStorageLimitBytes(plan);
}

// ── Stripe sync ───────────────────────────────────────────────────────────────

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
      // Prefer an active subscription; fall back to the most recent one
      const active = await stripe.subscriptions.list({
        customer: subscription.stripeCustomerId,
        status: "active",
        limit: 1,
      });
      stripeSub = active.data[0] ?? null;
      if (!stripeSub) {
        const all = await stripe.subscriptions.list({
          customer: subscription.stripeCustomerId,
          status: "all",
          limit: 1,
        });
        stripeSub = all.data[0] ?? null;
      }
    }

    if (!stripeSub) {
      return subscription.plan;
    }

    const isActive = stripeSub.status === "active" || stripeSub.status === "trialing";
    const priceId = stripeSub.items.data[0]?.price.id;
    const plan: SubscriptionPlan = isActive ? planFromPriceId(priceId) : "FREE";

    const oldPlan = subscription.plan;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPeriodStart = (stripeSub as any).current_period_start;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawPeriodEnd = (stripeSub as any).current_period_end;

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeSubscriptionId: stripeSub.id,
        stripePriceId: priceId,
        plan,
        status: isActive ? "ACTIVE" : "CANCELED",
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        ...(rawPeriodStart ? { currentPeriodStart: new Date(rawPeriodStart * 1000) } : {}),
        ...(rawPeriodEnd ? { currentPeriodEnd: new Date(rawPeriodEnd * 1000) } : {}),
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
  if (!priceId) return "FREE";
  // Support both the new env var names and the old names so existing .env files
  // don't break before they're updated.
  const institutionIds = [
    process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD,
    process.env.STRIPE_INSTITUTION_PRICE_ID,
  ].filter(Boolean);
  const proIds = [
    process.env.STRIPE_PRICE_PRO_BASE_CAD,
    process.env.STRIPE_PRO_PRICE_ID,
  ].filter(Boolean);
  if (institutionIds.includes(priceId)) return "INSTITUTION";
  if (proIds.includes(priceId)) return "PRO";
  return "FREE";
}
