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
  getSharedStorageLimitBytes,
  getPrivateStorageLimitPerUserBytes,
  getWorkspaceSharedStorageBytes,
  getUserPrivateStorageBytes,
  getWorkspaceActiveMemberCount,
  getWorkspaceRecordingSecondsThisPeriod,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { upgradeWorkspaceToPlan, openBillingPortal, refreshBillingStatus } from "./billing-actions";

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
        members: {
          where: { status: "ACTIVE" },
          select: { userId: true, role: true },
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            stripeCustomerId: true,
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
  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  if (currentMembership.role !== "OWNER") {
    return (
      <ProtectedPageMessage
        title="Billing is owner-only"
        message="Only the workspace owner can manage billing settings."
      />
    );
  }

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
  const planPrice = isFree ? "$0" : isPro ? "$25 CAD/mo" : isInstitution ? "$65 CAD/mo" : "Custom";

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[700px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <Link
            href={`/workspaces/${id}`}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
            Billing
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            Manage your workspace plan and subscription.
          </p>

          {isFree && memberCount > FREE_MEMBER_LIMIT ? (
            <div className="mt-4 rounded-xl border border-[var(--color-danger)] bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
              This workspace has {memberCount} members but the Free plan allows {FREE_MEMBER_LIMIT}. Remove a member or upgrade to Pro.
            </div>
          ) : null}

          {getBillingStatusMessage(billingStatus) ? (
            <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              billingStatus === "success"
                ? "border-[var(--color-success)] bg-[var(--color-success-dim)] text-[var(--color-success)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
            }`}>
              {getBillingStatusMessage(billingStatus)}
            </p>
          ) : null}
        </header>

        <div className="flex flex-col gap-6">
          {/* Current plan card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                  Current plan
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">
                  {planLabel}
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${
                isFree
                  ? "bg-[var(--color-surface-high)] text-[var(--color-muted)]"
                  : "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
              }`}>
                {planPrice}
              </span>
            </div>

            {/* Usage meters */}
            <div className="mt-6 flex flex-col gap-4">
              <UsageMeter
                label="Members"
                current={memberCount}
                limit={memberLimit}
                percent={memberPercent}
                formatValue={(v) => String(v)}
                upgradeNote={isFree && memberCount >= FREE_MEMBER_LIMIT ? "Upgrade to Pro for up to 20 included members." : undefined}
              />
              <UsageMeter
                label="Shared storage"
                current={storageBytes}
                limit={storageLimitBytes}
                percent={storagePercent}
                formatValue={formatBytes}
              />
              <UsageMeter
                label="Your private storage"
                current={privateStorageBytes}
                limit={privateStorageLimitBytes}
                percent={privateStoragePercent}
                formatValue={formatBytes}
              />
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

            {/* Subscription info */}
            {!isFree && subscription?.currentPeriodEnd ? (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                subscription.cancelAtPeriodEnd
                  ? "border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] text-[var(--color-warning)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-muted)]"
              }`}>
                {subscription.cancelAtPeriodEnd
                  ? `Subscription cancels on ${formatDate(subscription.currentPeriodEnd)} — recordings and group access will stop.`
                  : `Next billing date: ${formatDate(subscription.currentPeriodEnd)}`}
              </div>
            ) : null}

            {/* Refresh button */}
            <form action={refreshBillingStatus} className="mt-4">
              <input type="hidden" name="workspaceId" value={id} />
              <PendingSubmitButton
                pendingLabel="Refreshing..."
                className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
              >
                Refresh billing status
              </PendingSubmitButton>
            </form>
          </div>

          {/* Upgrade section — shown for Free and Pro */}
          {(isFree || isPro) ? (
            <div id="upgrade" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">
                {isFree ? "Upgrade your plan" : "Upgrade to Institution"}
              </h2>

              {isFree ? (
                <div className="mt-5 flex flex-col gap-4 sm:flex-row">
                  <PlanUpgradeCard
                    name="Pro"
                    price="$25 CAD/mo"
                    features={[
                      "20 included members (+$1 CAD/mo per extra)",
                      "Shared + collaborative whiteboards",
                      "Whiteboard PDF export & image uploads",
                      "Meeting recordings — 5 hrs/mo included",
                      "Groups for sub-team scoping",
                      "10 GB shared storage · 2 GB private",
                    ]}
                    workspaceId={id}
                    plan="PRO"
                    highlighted
                  />
                  <PlanUpgradeCard
                    name="Institution"
                    price="$65 CAD/mo"
                    features={[
                      "50 included members (+$0.50 CAD/mo per extra)",
                      "Everything in Pro",
                      "20 hrs/mo recording",
                      "Audit log",
                      "50 GB shared storage · 5 GB private",
                    ]}
                    workspaceId={id}
                    plan="INSTITUTION"
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-[var(--color-muted)]">
                    Institution includes 50 members, 20 hrs/mo of recordings, audit log access, and 50 GB shared storage.
                  </p>
                  <form action={upgradeWorkspaceToPlan} className="mt-5">
                    <input type="hidden" name="workspaceId" value={id} />
                    <input type="hidden" name="plan" value="INSTITUTION" />
                    <PendingSubmitButton
                      pendingLabel="Redirecting to checkout..."
                      className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                    >
                      Upgrade to Institution — $65 CAD/month
                    </PendingSubmitButton>
                  </form>
                </div>
              )}

              <p className="mt-4 text-xs text-[var(--color-subtle)]">
                Cancel anytime.{" "}
                <Link href="/pricing" className="underline hover:no-underline">
                  Compare all plans →
                </Link>
              </p>
            </div>
          ) : null}

          {/* Enterprise contact */}
          {(isPro || isInstitution) && !isEnterprise ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Enterprise</h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Need custom member limits, SLA, dedicated support, or an annual contract? Enterprise is billed manually.
              </p>
              <a
                href="mailto:hello@scribblapp.ca?subject=Enterprise%20inquiry"
                className="mt-4 inline-block rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
              >
                Contact sales
              </a>
            </div>
          ) : null}

          {/* Manage subscription (Pro or Institution with Stripe) */}
          {(isPro || isInstitution) && subscription?.stripeCustomerId ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Manage subscription</h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Update your payment method, download invoices, or cancel your subscription.
              </p>
              <form action={openBillingPortal} className="mt-5">
                <input type="hidden" name="workspaceId" value={id} />
                <PendingSubmitButton
                  pendingLabel="Opening billing portal..."
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                >
                  Open billing portal
                </PendingSubmitButton>
              </form>
            </div>
          ) : null}

          <p className="text-center text-sm text-[var(--color-subtle)]">
            <Link href="/pricing" className="font-medium text-[var(--color-secondary)] hover:underline">
              View all plans and features →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function PlanUpgradeCard({
  name,
  price,
  features,
  workspaceId,
  plan,
  highlighted = false,
}: {
  name: string;
  price: string;
  features: string[];
  workspaceId: string;
  plan: "PRO" | "INSTITUTION";
  highlighted?: boolean;
}) {
  return (
    <div className={`flex flex-1 flex-col rounded-2xl border p-5 ${
      highlighted
        ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)]"
        : "border-[var(--color-border)] bg-[var(--color-surface-low)]"
    }`}>
      {highlighted ? (
        <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-secondary)]">
          Most popular
        </p>
      ) : null}
      <p className="font-display text-lg font-bold text-[var(--color-text)]">{name}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--color-muted)]">{price}</p>
      <ul className="mt-3 flex flex-1 flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
            <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-dim)]">
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
            </span>
            {f}
          </li>
        ))}
      </ul>
      <form action={upgradeWorkspaceToPlan} className="mt-5">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="plan" value={plan} />
        <PendingSubmitButton
          pendingLabel="Redirecting..."
          className={`w-full rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            highlighted
              ? "bg-[var(--color-primary)] text-white hover:opacity-80"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          }`}
        >
          Upgrade to {name}
        </PendingSubmitButton>
      </form>
    </div>
  );
}

function UsageMeter({
  label,
  current,
  limit,
  percent,
  formatValue = (v: number) => String(v),
  upgradeNote,
}: {
  label: string;
  current: number;
  limit: number | null;
  percent: number | null;
  formatValue?: (v: number) => string;
  upgradeNote?: string;
}) {
  const barColor =
    percent === null
      ? "bg-[var(--color-secondary)]"
      : percent >= 95
      ? "bg-[var(--color-danger)]"
      : percent >= 80
      ? "bg-[var(--color-warning)]"
      : "bg-[var(--color-secondary)]";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">{label}</span>
        <span className="font-mono text-xs text-[var(--color-subtle)]">
          {formatValue(current)}
          {limit !== null ? ` / ${formatValue(limit)}` : " (unlimited)"}
        </span>
      </div>
      {percent !== null ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-high)]">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-secondary-dim)]">
          <div className="h-full w-full rounded-full bg-[var(--color-secondary)] opacity-40" />
        </div>
      )}
      {upgradeNote ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]">{upgradeNote}</p>
      ) : null}
    </div>
  );
}

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
    case "success":
      return "Payment received — your plan will update shortly. Refresh this page in a moment if it still shows Free.";
    case "canceled":
      return "Checkout was canceled. No charge was made.";
    case "checkout-failed":
      return "Could not start checkout. Please try again or contact support.";
    case "portal-failed":
      return "Could not open the billing portal. Please try again or contact support.";
    case "no-subscription":
      return "No billing account found for this workspace. Upgrade to Pro to create one.";
    case "refreshed":
      return "Billing status refreshed.";
    case "unauthorized":
      return "Only the workspace owner can manage billing.";
    case "invalid-plan":
      return "Invalid plan selected. Please try again.";
    case "use-portal-to-change":
      return "To change or downgrade your plan, use the billing portal.";
    default:
      return null;
  }
}
