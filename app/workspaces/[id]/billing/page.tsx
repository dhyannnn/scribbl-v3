import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  FREE_MEMBER_LIMIT,
  FREE_STORAGE_BYTES,
  FREE_WORKSPACE_LIMIT,
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
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">

        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${id}`} className="text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <h1 className="mt-4 text-2xl font-semibold sm:text-3xl lg:text-4xl">Billing</h1>
          <p className="mt-3 text-base leading-7 text-[#62645c]">
            Manage your workspace plan and subscription.
          </p>
        </header>

        {getBillingStatusMessage(billingStatus) ? (
          <p className={`rounded-md border px-4 py-3 text-sm shadow-sm ${billingStatus === "success" ? "border-[#d8e8d8] bg-[#f0f8f0] text-[#2f604b]" : "border-[#d8d8ce] bg-white text-[#4d4f47]"}`}>
            {getBillingStatusMessage(billingStatus)}
          </p>
        ) : null}

        {/* Current plan */}
        <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#777970]">Current plan</p>
              <h2 className="mt-1 text-2xl font-bold">
                {isFree ? "Free" : isPro ? "Pro" : "Institution"}
              </h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${isFree ? "bg-[#f1f1eb] text-[#66685f]" : "bg-[#e7eee7] text-[#2f604b]"}`}>
              {isFree ? "Free" : `$${isPro ? "20" : "299"} CAD/mo`}
            </span>
          </div>

          {/* Usage meters — always show */}
          <div className="mt-6 grid gap-4">
            <UsageMeter
              label="Members"
              current={memberCount}
              limit={isFree ? FREE_MEMBER_LIMIT : null}
              unit="members"
              percent={isFree ? memberPercent : null}
              linkHref={isFree && memberCount >= FREE_MEMBER_LIMIT ? `#upgrade` : undefined}
            />
            <UsageMeter
              label="File storage"
              current={storageBytes}
              limit={storageLimitBytes}
              unit="storage"
              percent={storagePercent}
              formatValue={formatBytes}
            />
          </div>

          {/* Manual sync button — useful when webhook hasn't fired yet */}
          <form action={refreshBillingStatus} className="mt-4">
            <input type="hidden" name="workspaceId" value={id} />
            <PendingSubmitButton
              pendingLabel="Refreshing..."
              className="rounded-md border border-[#c8c8bd] bg-white px-3 py-1.5 text-xs font-medium text-[#66685f] transition hover:border-[#2f604b] hover:text-[#2f604b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh billing status
            </PendingSubmitButton>
          </form>

          {/* Subscription info for paid plans */}
          {!isFree && subscription?.currentPeriodEnd ? (
            <div className={`mt-6 rounded-md border px-4 py-3 text-sm ${subscription.cancelAtPeriodEnd ? "border-[#ead1cd] bg-[#fff7f5] text-[#7a3434]" : "border-[#e2e2d8] bg-[#fbfbf8] text-[#4d4f47]"}`}>
              {subscription.cancelAtPeriodEnd
                ? `⚠️ Subscription cancels on ${formatDate(subscription.currentPeriodEnd)} — recordings and group access will stop.`
                : `Next billing date: ${formatDate(subscription.currentPeriodEnd)}`}
            </div>
          ) : null}
        </section>

        {/* Actions */}
        {isFree ? (
          <section id="upgrade" className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Upgrade to Pro</h2>
            <p className="mt-2 text-sm leading-6 text-[#62645c]">
              $20 CAD per month. Unlock everything for this workspace.
            </p>

            <ul className="mt-4 grid gap-2 text-sm text-[#4d4f47]">
              {[
                "Unlimited members",
                "Meeting recordings (auto-saved to workspace files)",
                "Groups — scope meetings and notifications to sub-teams",
                "10 GB file storage",
                "No tldraw whiteboard watermark",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="text-[#2f604b]">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <form action={upgradeWorkspaceToPro} className="mt-6">
              <input type="hidden" name="workspaceId" value={id} />
              <PendingSubmitButton
                pendingLabel="Redirecting to checkout..."
                className="w-full rounded-md bg-[#2f604b] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Upgrade to Pro — $20 CAD/month
              </PendingSubmitButton>
            </form>

            <p className="mt-3 text-xs text-[#777970]">
              Cancel anytime. Taxes calculated at checkout.{" "}
              <Link href="/pricing" className="underline hover:no-underline">
                Compare all plans
              </Link>
            </p>
          </section>
        ) : null}

        {(isPro || isInstitution) && !isInstitution ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Manage subscription</h2>
            <p className="mt-2 text-sm leading-6 text-[#62645c]">
              Update your payment method, download invoices, or cancel your subscription.
            </p>
            <form action={openBillingPortal} className="mt-5">
              <input type="hidden" name="workspaceId" value={id} />
              <PendingSubmitButton
                pendingLabel="Opening billing portal..."
                className="rounded-md border border-[#2f604b] bg-white px-5 py-2.5 text-sm font-semibold text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Open billing portal
              </PendingSubmitButton>
            </form>
          </section>
        ) : null}

        {isInstitution ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Institution plan</h2>
            <p className="mt-2 text-sm leading-6 text-[#62645c]">
              Your workspace is covered by an Institution subscription.
              To manage billing, update payment details, or cancel, contact us directly.
            </p>
            <a
              href="mailto:hello@scribblapp.ca"
              className="mt-5 inline-block rounded-md border border-[#2f604b] bg-white px-5 py-2.5 text-sm font-semibold text-[#2f604b] transition hover:bg-[#eef5ef]"
            >
              Contact billing support
            </a>
          </section>
        ) : null}

        {/* Link to pricing page */}
        <p className="text-center text-sm text-[#777970]">
          <Link href="/pricing" className="font-medium text-[#2f604b] hover:underline">
            View all plans and features →
          </Link>
        </p>

      </div>
    </main>
  );
}

function UsageMeter({
  label,
  current,
  limit,
  unit,
  percent,
  formatValue = (v: number) => String(v),
  linkHref,
}: {
  label: string;
  current: number;
  limit: number | null;
  unit: string;
  percent: number | null;
  formatValue?: (v: number) => string;
  linkHref?: string;
}) {
  const barColor =
    percent === null ? "bg-[#2f604b]"
    : percent >= 95 ? "bg-[#b65b5b]"
    : percent >= 80 ? "bg-[#c47d1f]"
    : "bg-[#2f604b]";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-[#4d4f47]">{label}</span>
        <span className="text-[#66685f]">
          {formatValue(current)}
          {limit !== null ? ` / ${formatValue(limit)}` : " (unlimited)"}
        </span>
      </div>
      {percent !== null ? (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e6e6dc]">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e7eee7]">
          <div className="h-full w-full rounded-full bg-[#2f604b] opacity-30" />
        </div>
      )}
      {linkHref && percent !== null && percent >= 100 ? (
        <p className="mt-1 text-xs text-[#7a3434]">
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
