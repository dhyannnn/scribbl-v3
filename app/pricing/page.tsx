import Link from "next/link";
import { Check, X } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export default async function PricingPage() {
  const currentUser = await getCurrentUser();

  // Fetch the user's owned workspaces with their plans so we can show accurate CTAs
  let proWorkspaces: { id: string; name: string }[] = [];
  let hasInstitution = false;
  let freeWorkspaceCount = 0;

  if (currentUser) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: currentUser.id, status: "ACTIVE", role: "OWNER" },
      select: { workspace: { select: { id: true, name: true, plan: true } } },
    });
    const workspaces = memberships.map((m) => m.workspace);
    proWorkspaces = workspaces.filter((w) => w.plan === "PRO");
    hasInstitution = workspaces.some((w) => w.plan === "INSTITUTION");
    freeWorkspaceCount = workspaces.filter((w) => w.plan === "FREE").length;
  }

  const hasPro = proWorkspaces.length > 0;
  const isLoggedIn = Boolean(currentUser);

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-12 sm:px-8 lg:px-10">

        <header className="text-center">
          <Link href="/" className="text-sm font-medium text-[#2f604b]">← Back to Scribbl</Link>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl lg:text-5xl">Simple, transparent pricing</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-[#62645c]">
            One workspace, one price. No per-seat fees. Cancel anytime.
          </p>
        </header>

        {/* Current plan banner for logged-in users with paid plans */}
        {isLoggedIn && (hasPro || hasInstitution) ? (
          <div className="rounded-xl border border-[#d8e8d8] bg-[#f0f8f0] px-5 py-4">
            <p className="text-sm font-medium text-[#2f604b]">
              {hasInstitution
                ? "You have an Institution plan."
                : `You have ${proWorkspaces.length} Pro workspace${proWorkspaces.length === 1 ? "" : "s"}: ${proWorkspaces.map((w) => w.name).join(", ")}.`}
            </p>
            <p className="mt-1 text-sm text-[#4d6b50]">
              To manage, change payment method, or cancel — go to your workspace settings and click{" "}
              <strong>Manage Billing → Open billing portal</strong>.
            </p>
            {proWorkspaces.length === 1 ? (
              <Link
                href={`/workspaces/${proWorkspaces[0].id}/billing`}
                className="mt-2 inline-block text-sm font-medium text-[#2f604b] underline hover:no-underline"
              >
                Go to billing settings →
              </Link>
            ) : (
              <Link
                href="/"
                className="mt-2 inline-block text-sm font-medium text-[#2f604b] underline hover:no-underline"
              >
                Go to dashboard →
              </Link>
            )}
          </div>
        ) : null}

        {/* Tier cards */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Free */}
          <div className="flex flex-col rounded-xl border border-[#d8d8ce] bg-white p-7 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#777970]">Free</p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$0</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Forever free for small groups.</p>

            {!isLoggedIn ? (
              <Link href="/login" className="mt-6 block rounded-lg border border-[#2f604b] px-5 py-2.5 text-center text-sm font-semibold text-[#2f604b] transition hover:bg-[#eef5ef]">
                Get started free
              </Link>
            ) : !hasPro && !hasInstitution ? (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-[#e2e2d8] bg-[#f7f7f2] px-5 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[#2f604b]" />
                <span className="text-sm font-semibold text-[#2f604b]">Current plan</span>
              </div>
            ) : (
              <Link href="/" className="mt-6 block rounded-lg border border-[#d8d8ce] px-5 py-2.5 text-center text-sm font-semibold text-[#66685f] transition hover:border-[#2f604b] hover:text-[#2f604b]">
                Go to dashboard
              </Link>
            )}

            <ul className="mt-7 grid gap-3 text-sm text-[#4d4f47]">
              {freeTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="flex flex-col rounded-xl border-2 border-[#2f604b] bg-white p-7 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#2f604b]">Pro</p>
              {!hasPro ? (
                <span className="rounded-full bg-[#e7eee7] px-2.5 py-0.5 text-xs font-semibold text-[#2f604b]">Most popular</span>
              ) : (
                <span className="rounded-full bg-[#e7eee7] px-2.5 py-0.5 text-xs font-semibold text-[#2f604b]">Active ✓</span>
              )}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$20</span>
              <span className="mb-1 text-sm text-[#66685f]">CAD / workspace / month</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Everything your team needs.</p>

            {!isLoggedIn ? (
              <Link href="/login" className="mt-6 block rounded-lg bg-[#2f604b] px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]">
                Get started
              </Link>
            ) : hasPro ? (
              <div className="mt-6 grid gap-2">
                {proWorkspaces.length === 1 ? (
                  <Link
                    href={`/workspaces/${proWorkspaces[0].id}/billing`}
                    className="block rounded-lg bg-[#2f604b] px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]"
                  >
                    Manage subscription
                  </Link>
                ) : (
                  <Link href="/" className="block rounded-lg bg-[#2f604b] px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]">
                    Manage subscriptions
                  </Link>
                )}
                <p className="text-center text-xs text-[#777970]">
                  To downgrade or cancel, use the billing portal in workspace settings.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-2">
                <Link href="/" className="block rounded-lg bg-[#2f604b] px-5 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]">
                  Upgrade from workspace settings
                </Link>
                <p className="text-center text-xs text-[#777970]">
                  Go to your workspace → Manage Billing → Upgrade to Pro
                </p>
              </div>
            )}

            <ul className="mt-7 grid gap-3 text-sm text-[#4d4f47]">
              {proTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>

          {/* Institution */}
          <div className="flex flex-col rounded-xl border border-[#d8d8ce] bg-white p-7 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#777970]">Institution</p>
              {hasInstitution ? (
                <span className="rounded-full bg-[#e7eee7] px-2.5 py-0.5 text-xs font-semibold text-[#2f604b]">Active ✓</span>
              ) : null}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$299</span>
              <span className="mb-1 text-sm text-[#66685f]">CAD / month</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Unlimited workspaces for schools and companies.</p>

            <a
              href="mailto:billing@scribblapp.ca?subject=Scribbl Institution Plan"
              className="mt-6 block rounded-lg border border-[#d8d8ce] px-5 py-2.5 text-center text-sm font-semibold text-[#20201d] transition hover:border-[#2f604b] hover:text-[#2f604b]"
            >
              Contact us
            </a>
            {hasInstitution ? (
              <p className="mt-2 text-center text-xs text-[#777970]">
                To manage billing, email us or contact your Scribbl account manager.
              </p>
            ) : null}

            <ul className="mt-7 grid gap-3 text-sm text-[#4d4f47]">
              {institutionTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>
        </div>

        {/* Comparison table */}
        <section>
          <h2 className="text-center text-2xl font-bold">Full comparison</h2>
          <div className="mt-8 overflow-hidden rounded-xl border border-[#d8d8ce] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e2d8] bg-[#f7f7f2]">
                  <th className="px-6 py-4 text-left font-semibold text-[#20201d]">Feature</th>
                  <th className="px-6 py-4 text-center font-medium text-[#66685f]">Free</th>
                  <th className="px-6 py-4 text-center font-semibold text-[#2f604b]">Pro</th>
                  <th className="px-6 py-4 text-center font-medium text-[#66685f]">Institution</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, free, pro, institution }, i) => (
                  <tr key={feature} className={i < comparisonRows.length - 1 ? "border-b border-[#f1f1eb]" : ""}>
                    <td className="px-6 py-4 font-medium text-[#4d4f47]">{feature}</td>
                    <td className="px-6 py-4 text-center"><CellValue value={free} /></td>
                    <td className="px-6 py-4 text-center"><CellValue value={pro} primary /></td>
                    <td className="px-6 py-4 text-center"><CellValue value={institution} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-2xl">
          <h2 className="text-center text-xl font-bold">Good to know</h2>
          <dl className="mt-6 grid gap-5">
            {[
              ["Is billing per user or per workspace?", "Per workspace. Every member of a Pro workspace is included at no extra charge."],
              ["How do I downgrade or cancel?", "Go to your workspace → Manage Billing → Open billing portal. Stripe's portal lets you cancel at any time. Your workspace reverts to Free at the end of the billing period — no data is deleted."],
              ["What happens if I cancel?", "Your workspace stays Pro until the end of the paid period. After that it reverts to Free — recordings and group access stop, but all your notes, files, and chat history are preserved."],
              ["Are taxes included?", "Prices shown are before tax. Canadian GST/HST is calculated at checkout based on your billing address."],
              ["What payment methods are accepted?", "All major credit and debit cards via Stripe. Invoices available for Institution plans — contact billing@scribblapp.ca."],
            ].map(([q, a]) => (
              <div key={String(q)}>
                <dt className="font-semibold text-[#20201d]">{q}</dt>
                <dd className="mt-1 text-sm leading-6 text-[#62645c]">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

      </div>
    </main>
  );
}

function FeatureRow({ label, included }: { label: string; included: boolean | string }) {
  return (
    <li className="flex items-start gap-2.5">
      {included === true ? (
        <span className="mt-0.5 shrink-0 text-[#2f604b]">✓</span>
      ) : included === false ? (
        <span className="mt-0.5 shrink-0 text-[#c8c8bd]">✗</span>
      ) : (
        <span className="mt-0.5 shrink-0 text-[#c47d1f]">~</span>
      )}
      <span className={included === false ? "text-[#9a9b94]" : ""}>{label}</span>
    </li>
  );
}

function CellValue({ value, primary = false }: { value: boolean | string; primary?: boolean }) {
  if (value === true) {
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${primary ? "bg-[#2f604b] text-white" : "bg-[#e7eee7] text-[#2f604b]"}`}>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f1eb] text-[#c8c8bd]">
        <X size={13} strokeWidth={2.5} />
      </span>
    );
  }
  return <span className="text-xs font-medium text-[#4d4f47]">{value}</span>;
}

const freeTierFeatures = [
  { label: "Up to 3 workspaces", included: true },
  { label: "Up to 5 members per workspace", included: true },
  { label: "Video calls", included: true },
  { label: "Notes & whiteboards", included: true },
  { label: "Chat", included: true },
  { label: "File sharing (500 MB storage)", included: true },
  { label: "PDF export", included: true },
  { label: "Meeting recordings", included: false },
  { label: "Groups", included: false },
  { label: "tldraw watermark shows", included: "Shows" },
];

const proTierFeatures = [
  { label: "Unlimited workspaces", included: true },
  { label: "Unlimited members", included: true },
  { label: "Video calls", included: true },
  { label: "Notes & whiteboards", included: true },
  { label: "Chat", included: true },
  { label: "File sharing (10 GB storage)", included: true },
  { label: "PDF export", included: true },
  { label: "Meeting recordings", included: true },
  { label: "Groups", included: true },
  { label: "No tldraw watermark", included: true },
];

const institutionTierFeatures = [
  { label: "Unlimited workspaces (org-wide)", included: true },
  { label: "Unlimited members", included: true },
  { label: "Everything in Pro", included: true },
  { label: "100 GB storage", included: true },
  { label: "Audit logs", included: true },
  { label: "Priority support", included: true },
  { label: "Invoice billing", included: true },
];

const comparisonRows = [
  { feature: "Workspaces", free: "3", pro: "Unlimited", institution: "Unlimited" },
  { feature: "Members per workspace", free: "5", pro: "Unlimited", institution: "Unlimited" },
  { feature: "Video calls", free: true, pro: true, institution: true },
  { feature: "Notes & whiteboards", free: true, pro: true, institution: true },
  { feature: "Chat", free: true, pro: true, institution: true },
  { feature: "PDF export", free: true, pro: true, institution: true },
  { feature: "File storage", free: "500 MB", pro: "10 GB", institution: "100 GB" },
  { feature: "Meeting recordings", free: false, pro: true, institution: true },
  { feature: "Groups", free: false, pro: true, institution: true },
  { feature: "Audit logs", free: false, pro: false, institution: true },
  { feature: "tldraw watermark", free: "Shows", pro: false, institution: false },
  { feature: "Priority support", free: false, pro: false, institution: true },
];
