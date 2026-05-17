import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  FREE_MEMBER_LIMIT,
  FREE_STORAGE_BYTES,
  PRO_STORAGE_BYTES,
  getWorkspaceActiveMemberCount,
  getWorkspaceStorageBytes,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { upgradeWorkspaceToPro, openBillingPortal, refreshBillingStatus } from "./billing-actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ billing?: string }>;
};

export default async function BillingPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { billing: billingStatus } = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) return <ProtectedPageMessage />;

  const [workspace, memberCount, storageBytes] = await Promise.all([
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
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            stripeCustomerId: true,
          },
        },
      },
    }),
    getWorkspaceActiveMemberCount(id),
    getWorkspaceStorageBytes(id),
  ]);

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

  const storageLimitBytes = isFree ? FREE_STORAGE_BYTES : PRO_STORAGE_BYTES;
  const storagePercent = Math.min(100, Math.round((storageBytes / storageLimitBytes) * 100));
  const memberPercent = isFree ? Math.min(100, Math.round((memberCount / FREE_MEMBER_LIMIT) * 100)) : 0;

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
                  {isFree ? "Free" : isPro ? "Pro" : "Institution"}
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${
                isFree
                  ? "bg-[var(--color-surface-high)] text-[var(--color-muted)]"
                  : "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
              }`}>
                {isFree ? "Free" : `$${isPro ? "20" : "299"} CAD/mo`}
              </span>
            </div>

            {/* Usage meters */}
            <div className="mt-6 flex flex-col gap-4">
              <UsageMeter
                label="Members"
                current={memberCount}
                limit={isFree ? FREE_MEMBER_LIMIT : null}
                percent={isFree ? memberPercent : null}
                formatValue={(v) => String(v)}
                unit="members"
                linkHref={isFree && memberCount >= FREE_MEMBER_LIMIT ? "#upgrade" : undefined}
              />
              <UsageMeter
                label="File storage"
                current={storageBytes}
                limit={storageLimitBytes}
                percent={storagePercent}
                formatValue={formatBytes}
                unit="storage"
              />
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

          {/* Upgrade to Pro */}
          {isFree ? (
            <div id="upgrade" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Upgrade to Pro</h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                $20 CAD per month. Unlock everything for this workspace.
              </p>

              <ul className="mt-4 flex flex-col gap-2">
                {[
                  "Unlimited members",
                  "Meeting recordings (auto-saved to workspace files)",
                  "Groups — scope meetings and notifications to sub-teams",
                  "10 GB file storage",
                  "No tldraw whiteboard watermark",
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2.5 text-sm text-[var(--color-muted)]">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-success-dim)]">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="var(--color-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <form action={upgradeWorkspaceToPro} className="mt-6">
                <input type="hidden" name="workspaceId" value={id} />
                <PendingSubmitButton
                  pendingLabel="Redirecting to checkout..."
                  className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                >
                  Upgrade to Pro — $20 CAD/month
                </PendingSubmitButton>
              </form>

              <p className="mt-3 text-xs text-[var(--color-subtle)]">
                Cancel anytime.{" "}
                <Link href="/pricing" className="underline hover:no-underline">
                  Compare all plans →
                </Link>
              </p>
            </div>
          ) : null}

          {/* Manage subscription (Pro only, not Institution) */}
          {isPro ? (
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

          {/* Institution */}
          {isInstitution ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Institution plan</h2>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Your workspace is on the Institution plan.
                To manage billing, update payment details, or cancel, contact us directly.
              </p>
              <a
                href="mailto:hello@scribblapp.ca"
                className="mt-5 inline-block rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
              >
                Contact billing support
              </a>
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

function UsageMeter({
  label,
  current,
  limit,
  percent,
  formatValue = (v: number) => String(v),
  unit,
  linkHref,
}: {
  label: string;
  current: number;
  limit: number | null;
  percent: number | null;
  formatValue?: (v: number) => string;
  unit: string;
  linkHref?: string;
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
      {linkHref && percent !== null && percent >= 100 ? (
        <p className="mt-1 text-xs text-[var(--color-danger)]">
          Limit reached —{" "}
          <a href={linkHref} className="font-medium underline">upgrade to Pro</a>
          {" "}for unlimited {unit}.
        </p>
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
    default:
      return null;
  }
}
