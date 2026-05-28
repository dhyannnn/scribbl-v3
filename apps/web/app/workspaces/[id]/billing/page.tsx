import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  FREE_MEMBER_LIMIT,
  PRO_MEMBER_LIMIT,
  INSTITUTION_MEMBER_LIMIT,
  PRO_RECORDING_HOURS,
  INSTITUTION_RECORDING_HOURS,
  FREE_SHARED_STORAGE_BYTES,
  PRO_SHARED_STORAGE_BYTES,
  getSharedStorageLimitBytes,
  getPrivateStorageLimitPerUserBytes,
  getWorkspaceSharedStorageBytes,
  getUserPrivateStorageBytes,
  getWorkspaceActiveMemberCount,
  getWorkspaceRecordingSecondsThisPeriod,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { upgradeWorkspaceToPlan, openBillingPortal, refreshBillingStatus, downgradeToFree } from "./billing-actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ billing?: string }>;
};

export default async function BillingPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { billing: billingStatus } = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) return <ProtectedPageMessage />;

  const [workspace, memberCount, storageBytes, privateStorageBytes] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id },
      include: {
        members: { where: { status: "ACTIVE" }, select: { userId: true, role: true } },
        subscription: {
          select: {
            plan: true, status: true, currentPeriodStart: true, currentPeriodEnd: true,
            cancelAtPeriodEnd: true, stripeCustomerId: true,
          },
        },
      },
    }),
    getWorkspaceActiveMemberCount(id),
    getWorkspaceSharedStorageBytes(id),
    getUserPrivateStorageBytes(currentUser.id, id),
  ]);

  const recordingSecondsUsed =
    workspace?.subscription?.currentPeriodStart && workspace.plan !== "FREE" && workspace.plan !== "ENTERPRISE"
      ? await getWorkspaceRecordingSecondsThisPeriod(id, workspace.subscription.currentPeriodStart)
      : 0;
  const recordingHoursUsed = Math.round((recordingSecondsUsed / 3600) * 10) / 10;

  if (!workspace) notFound();

  const currentMembership = workspace.members.find((m) => m.userId === currentUser.id);
  if (!currentMembership) return <ProtectedPageMessage title="You do not have access" message="Ask the workspace owner to add the email address on your Scribbl account." />;
  if (currentMembership.role !== "OWNER") return <ProtectedPageMessage title="Billing is owner-only" message="Only the workspace owner can manage billing settings." />;

  const plan = workspace.plan;
  const subscription = workspace.subscription;
  const isFree = plan === "FREE";
  const isPro = plan === "PRO";
  const isInstitution = plan === "INSTITUTION";
  const isEnterprise = plan === "ENTERPRISE";

  const storageLimitBytes = getSharedStorageLimitBytes(plan);
  const storagePercent = Math.min(100, Math.round((storageBytes / storageLimitBytes) * 100));
  const privateStorageLimitBytes = getPrivateStorageLimitPerUserBytes(plan);
  const privateStoragePercent = Math.min(100, Math.round((privateStorageBytes / privateStorageLimitBytes) * 100));
  const memberLimit = isFree ? FREE_MEMBER_LIMIT : isPro ? PRO_MEMBER_LIMIT : isInstitution ? INSTITUTION_MEMBER_LIMIT : null;
  const memberPercent = memberLimit !== null ? Math.min(100, Math.round((memberCount / memberLimit) * 100)) : null;

  const planLabel = isFree ? "Free" : isPro ? "Pro" : isInstitution ? "Institution" : "Enterprise";
  const planPrice = isFree ? "$0" : isPro ? "$25" : isInstitution ? "$65" : "Custom";
  const planCurrency = isFree ? "" : " CAD/mo";

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[860px] px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <Link href={`/workspaces/${id}`}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            {workspace.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Billing &amp; Subscriptions</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Manage your workspace plan and subscription.</p>
        </div>

        {/* Status message */}
        {getBillingStatusMessage(billingStatus) ? (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
            billingStatus === "success"
              ? "border-[var(--color-success)] bg-[var(--color-success-dim)] text-[var(--color-success)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
          }`}>
            {getBillingStatusMessage(billingStatus)}
          </div>
        ) : null}

        {/* Past-due payment warning */}
        {subscription?.status === "PAST_DUE" ? (
          <div className="mb-6 rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-dim)] px-5 py-4">
            <p className="font-semibold text-[var(--color-danger)]">Payment failed — action required</p>
            <p className="mt-1 text-sm text-[var(--color-danger)]">
              We could not process your last payment. Open the billing portal to update your payment method or your workspace will lose paid features.
            </p>
            {subscription.stripeCustomerId ? (
              <form action={openBillingPortal} className="mt-3">
                <input type="hidden" name="workspaceId" value={id} />
                <PendingSubmitButton pendingLabel="Opening…"
                  className="rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                  Update payment method →
                </PendingSubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {/* Member limit warning */}
        {isFree && memberCount > FREE_MEMBER_LIMIT ? (
          <div className="mb-6 rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
            This workspace has {memberCount} members but the Free plan allows {FREE_MEMBER_LIMIT}. Remove a member or upgrade.
          </div>
        ) : null}

        {/* ── Top row: Current plan + Actions ─────────────────────────────── */}
        <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_260px]">

          {/* Current plan card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
                  Active plan
                </span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-[var(--color-text)]">{planPrice}</span>
                  {planCurrency && <span className="text-sm text-[var(--color-muted)]">{planCurrency}</span>}
                </div>
                <p className="mt-0.5 font-display text-lg font-semibold text-[var(--color-text)]">{planLabel}</p>
              </div>
              <form action={refreshBillingStatus}>
                <input type="hidden" name="workspaceId" value={id} />
                <PendingSubmitButton pendingLabel="…"
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50">
                  Refresh
                </PendingSubmitButton>
              </form>
            </div>

            {/* Next billing date */}
            {!isFree && subscription?.currentPeriodEnd ? (
              <p className={`mt-3 text-xs ${subscription.cancelAtPeriodEnd ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"}`}>
                {subscription.cancelAtPeriodEnd
                  ? `⚠ Cancels ${formatDate(subscription.currentPeriodEnd)}`
                  : `Next billing date: ${formatDate(subscription.currentPeriodEnd)}`}
              </p>
            ) : null}

            <div className="mt-5 h-px bg-[var(--color-border)]" />

            {/* Usage meters */}
            <div className="mt-5 flex flex-col gap-4">
              <UsageMeter label="Members" current={memberCount} limit={memberLimit} percent={memberPercent} formatValue={(v) => String(v)} />
              <UsageMeter label="Shared storage" current={storageBytes} limit={storageLimitBytes} percent={storagePercent} formatValue={formatBytes} />
              <UsageMeter label="Your private storage" current={privateStorageBytes} limit={privateStorageLimitBytes} percent={privateStoragePercent} formatValue={formatBytes} />
              {!isFree && !isEnterprise ? (
                <UsageMeter
                  label="Recording hours this period"
                  current={recordingHoursUsed}
                  limit={isPro ? PRO_RECORDING_HOURS : INSTITUTION_RECORDING_HOURS}
                  percent={Math.min(100, Math.round((recordingHoursUsed / (isPro ? PRO_RECORDING_HOURS : INSTITUTION_RECORDING_HOURS)) * 100))}
                  formatValue={(v) => `${v} hr${v !== 1 ? "s" : ""}`}
                />
              ) : null}
            </div>
          </div>

          {/* Right column: actions */}
          <div className="flex flex-col gap-4">
            {/* Manage subscription — live Stripe subscription exists */}
            {(isPro || isInstitution) && subscription?.stripeCustomerId ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Subscription</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Update your payment method, download invoices, or cancel.
                </p>
                <form action={openBillingPortal} className="mt-4 grid gap-2">
                  <input type="hidden" name="workspaceId" value={id} />
                  <PendingSubmitButton pendingLabel="Opening portal…"
                    className="w-full rounded-full bg-[var(--color-secondary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-50">
                    Manage Subscription
                  </PendingSubmitButton>
                </form>
              </div>
            ) : null}

            {/* Orphaned paid plan — no Stripe subscription, so offer a direct downgrade */}
            {(isPro || isInstitution) && !subscription?.stripeCustomerId ? (
              <div className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-dim)] p-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-warning)]">No active billing</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  This workspace is on the {planLabel} plan but has no linked Stripe subscription. You can revert it to Free at any time — no charge will be made.
                </p>
                <form action={downgradeToFree} className="mt-4">
                  <input type="hidden" name="workspaceId" value={id} />
                  <PendingSubmitButton pendingLabel="Reverting…"
                    className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50">
                    Revert to Free
                  </PendingSubmitButton>
                </form>
              </div>
            ) : null}

            {/* Enterprise contact */}
            {!isEnterprise ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Enterprise</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">
                  Custom limits, SLA, dedicated support, annual contracts.
                </p>
                <a href="mailto:billing@scribblapp.ca?subject=Enterprise%20inquiry"
                  className="mt-4 flex w-full items-center justify-center rounded-full border border-[var(--color-border)] py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]">
                  Contact Sales
                </a>
              </div>
            ) : null}

            <Link href="/pricing"
              className="block text-center text-xs font-medium text-[var(--color-secondary)] hover:underline">
              Compare all plans →
            </Link>
          </div>
        </div>

        {/* ── Explore Plans ────────────────────────────────────────────────── */}
        {!isEnterprise ? (
          <div>
            <h2 className="mb-4 font-display text-lg font-bold text-[var(--color-text)]">Explore Plans</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <PlanCard
                name="Free"
                price="$0"
                period=""
                description="For solo projects and small teams."
                features={[
                  { label: "3 members", included: true },
                  { label: "500 MB shared storage", included: true },
                  { label: "Private whiteboards only", included: true },
                  { label: "Recordings", included: false },
                  { label: "Groups", included: false },
                  { label: "PDF export", included: false },
                ]}
                isCurrent={isFree}
                workspaceId={id}
                plan="FREE"
                ctaLabel={isFree ? "Current plan" : null}
                overLimitWarning={
                  !isFree && storageBytes > FREE_SHARED_STORAGE_BYTES
                    ? `You're using ${formatBytes(storageBytes)} — Free only allows 500 MB. New uploads will be blocked until you free up space.`
                    : !isFree && memberCount > FREE_MEMBER_LIMIT
                    ? `You have ${memberCount} members — Free only allows ${FREE_MEMBER_LIMIT}. Remove members before downgrading.`
                    : null
                }
              />
              <PlanCard
                name="Pro"
                price="$25"
                period="CAD/mo"
                description="For growing teams that need more."
                features={[
                  { label: "20 members included", included: true },
                  { label: "10 GB shared storage", included: true },
                  { label: "Shared whiteboards + PDF", included: true },
                  { label: "5 hrs recordings/mo", included: true },
                  { label: "Groups", included: true },
                  { label: "Audit log", included: false },
                ]}
                isCurrent={isPro}
                highlighted
                workspaceId={id}
                plan="PRO"
                ctaLabel={isPro ? "Current plan" : isFree ? "Upgrade to Pro" : isInstitution ? "Downgrade to Pro" : null}
                overLimitWarning={
                  isInstitution && storageBytes > PRO_SHARED_STORAGE_BYTES
                    ? `You're using ${formatBytes(storageBytes)} — Pro only allows 10 GB. New uploads will be blocked until you free up space.`
                    : isInstitution && memberCount > PRO_MEMBER_LIMIT
                    ? `You have ${memberCount} members — Pro only includes ${PRO_MEMBER_LIMIT}. Extra members will be billed at $1 CAD/mo each.`
                    : null
                }
              />
              <PlanCard
                name="Institution"
                price="$65"
                period="CAD/mo"
                description="For departments and institutions."
                features={[
                  { label: "50 members included", included: true },
                  { label: "50 GB shared storage", included: true },
                  { label: "Everything in Pro", included: true },
                  { label: "20 hrs recordings/mo", included: true },
                  { label: "Audit log", included: true },
                  { label: "Priority support", included: true },
                ]}
                isCurrent={isInstitution}
                workspaceId={id}
                plan="INSTITUTION"
                ctaLabel={isInstitution ? "Current plan" : (isPro ? "Upgrade to Institution" : null)}
              />
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}

// ── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  name, price, period, description, features, isCurrent, highlighted = false, workspaceId, plan, ctaLabel, overLimitWarning = null,
}: {
  name: string; price: string; period: string; description: string;
  features: { label: string; included: boolean }[];
  isCurrent: boolean; highlighted?: boolean;
  workspaceId: string; plan: "FREE" | "PRO" | "INSTITUTION";
  ctaLabel: string | null;
  overLimitWarning?: string | null;
}) {
  return (
    <div className={`relative flex flex-col rounded-2xl border p-5 ${
      highlighted
        ? "border-[var(--color-secondary)] bg-[var(--color-surface)]"
        : "border-[var(--color-border)] bg-[var(--color-surface)]"
    }`}>
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-[var(--color-secondary)] px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
            Most popular
          </span>
        </div>
      )}

      <p className="font-display text-lg font-bold text-[var(--color-text)]">{name}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold text-[var(--color-text)]">{price}</span>
        {period && <span className="text-xs text-[var(--color-muted)]">/{period.replace("CAD/", "").replace("mo", "mo")}</span>}
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>

      <ul className="mt-4 flex flex-1 flex-col gap-2">
        {features.map((f) => (
          <li key={f.label} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            {f.included ? (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)]">
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="var(--color-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
              </span>
            ) : (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-high)]">
                <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="var(--color-subtle)" strokeWidth="2.5" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>
              </span>
            )}
            <span className={f.included ? "text-[var(--color-text)]" : "text-[var(--color-subtle)] line-through"}>{f.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        {isCurrent ? (
          <div className="flex w-full items-center justify-center rounded-full border border-[var(--color-border)] py-2.5 text-sm font-semibold text-[var(--color-muted)]">
            Current plan
          </div>
        ) : ctaLabel ? (
          <form action={upgradeWorkspaceToPlan}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="plan" value={plan} />
            <PendingSubmitButton pendingLabel="Redirecting…"
              className={`w-full rounded-full py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                highlighted
                  ? "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)]"
                  : "border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
              }`}>
              {ctaLabel}
            </PendingSubmitButton>
          </form>
        ) : null}
      </div>

      {overLimitWarning ? (
        <div className="mt-3 rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-dim)] px-3 py-2.5 text-xs text-[var(--color-warning)]">
          ⚠ {overLimitWarning}
        </div>
      ) : null}
    </div>
  );
}

// ── Usage meter ───────────────────────────────────────────────────────────────

function UsageMeter({
  label, current, limit, percent, formatValue = (v: number) => String(v),
}: {
  label: string; current: number; limit: number | null;
  percent: number | null; formatValue?: (v: number) => string;
}) {
  const barColor = percent === null ? "bg-[var(--color-secondary)]"
    : percent >= 95 ? "bg-[var(--color-danger)]"
    : percent >= 80 ? "bg-[var(--color-warning)]"
    : "bg-[var(--color-secondary)]";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
        <span className="font-mono text-xs text-[var(--color-subtle)]">
          {formatValue(current)}{limit !== null ? ` / ${formatValue(limit)}` : ""}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-high)]">
        {percent !== null ? (
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-full rounded-full bg-[var(--color-secondary)] opacity-30" />
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

function getBillingStatusMessage(status?: string) {
  switch (status) {
    case "success": return "Payment received — your plan will update shortly. Refresh if it still shows Free.";
    case "canceled": return "Checkout was canceled. No charge was made.";
    case "checkout-failed": return "Could not start checkout. Please try again or contact support.";
    case "portal-failed": return "Could not open the billing portal. Please try again.";
    case "no-subscription": return "No billing account found. Upgrade to Pro to create one.";
    case "refreshed": return "Billing status refreshed.";
    case "unauthorized": return "Only the workspace owner can manage billing.";
    case "invalid-plan": return "Invalid plan selected. Please try again.";
    case "use-portal-to-change": return "To change or downgrade your plan, use the billing portal.";
    default: return null;
  }
}
