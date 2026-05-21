import Link from "next/link";
import { Check, X } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export default async function PricingPage() {
  const currentUser = await getCurrentUser();

  let proWorkspaces: { id: string; name: string }[] = [];
  let institutionWorkspaces: { id: string; name: string }[] = [];

  if (currentUser) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: currentUser.id, status: "ACTIVE", role: "OWNER" },
      select: { workspace: { select: { id: true, name: true, plan: true } } },
    });
    const workspaces = memberships.map((m) => m.workspace);
    proWorkspaces = workspaces.filter((w) => w.plan === "PRO");
    institutionWorkspaces = workspaces.filter((w) => w.plan === "INSTITUTION");
  }

  const hasPro = proWorkspaces.length > 0;
  const hasInstitution = institutionWorkspaces.length > 0;
  const isLoggedIn = Boolean(currentUser);
  const hasPaid = hasPro || hasInstitution;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-5 py-12 sm:px-8 lg:px-10">

        <header className="text-center">
          <Link href="/" className="text-sm font-medium text-[#2f604b]">← Back to Scribbl</Link>
          <h1 className="mt-6 text-3xl font-bold sm:text-4xl lg:text-5xl">Simple, transparent pricing</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-8 text-[#62645c]">
            Per workspace, not per seat. Cancel anytime.
          </p>
        </header>

        {/* Current plan banner */}
        {isLoggedIn && hasPaid ? (
          <div className="rounded-xl border border-[#d8e8d8] bg-[#f0f8f0] px-5 py-4">
            <p className="text-sm font-medium text-[#2f604b]">
              {hasInstitution
                ? `You have ${institutionWorkspaces.length} Institution workspace${institutionWorkspaces.length > 1 ? "s" : ""}: ${institutionWorkspaces.map((w) => w.name).join(", ")}.`
                : `You have ${proWorkspaces.length} Pro workspace${proWorkspaces.length > 1 ? "s" : ""}: ${proWorkspaces.map((w) => w.name).join(", ")}.`}
            </p>
            <p className="mt-1 text-sm text-[#4d6b50]">
              To manage billing, update payment, or cancel — go to your workspace and click{" "}
              <strong>Billing</strong> in the sidebar, then <strong>Open billing portal</strong>.
            </p>
          </div>
        ) : null}

        {/* Tier cards */}
        <div className="grid gap-6 lg:grid-cols-4">

          {/* Free */}
          <div className="flex flex-col rounded-xl border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#777970]">Free</p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$0</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Try Scribbl with a small group.</p>

            {!isLoggedIn ? (
              <Link href="/login" className="mt-6 block rounded-lg border border-[#2f604b] px-4 py-2.5 text-center text-sm font-semibold text-[#2f604b] transition hover:bg-[#eef5ef]">
                Get started free
              </Link>
            ) : !hasPaid ? (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-[#e2e2d8] bg-[#f7f7f2] px-4 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[#2f604b]" />
                <span className="text-sm font-semibold text-[#2f604b]">Current plan</span>
              </div>
            ) : (
              <Link href="/" className="mt-6 block rounded-lg border border-[#d8d8ce] px-4 py-2.5 text-center text-sm text-[#66685f] transition hover:border-[#2f604b] hover:text-[#2f604b]">
                Go to dashboard
              </Link>
            )}

            <ul className="mt-6 grid gap-2.5 text-sm text-[#4d4f47]">
              {freeTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="flex flex-col rounded-xl border-2 border-[#2f604b] bg-white p-6 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#2f604b]">Pro</p>
              <span className="rounded-full bg-[#e7eee7] px-2.5 py-0.5 text-xs font-semibold text-[#2f604b]">
                {hasPro ? "Active ✓" : "Most popular"}
              </span>
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$25</span>
              <span className="mb-1 text-sm text-[#66685f]">CAD / workspace / mo</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Everything your team needs.</p>

            {!isLoggedIn ? (
              <Link href="/login" className="mt-6 block rounded-lg bg-[#2f604b] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]">
                Get started
              </Link>
            ) : hasPro ? (
              <Link
                href={proWorkspaces.length === 1 ? `/workspaces/${proWorkspaces[0].id}/billing` : "/"}
                className="mt-6 block rounded-lg bg-[#2f604b] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]"
              >
                Manage subscription
              </Link>
            ) : (
              <div className="mt-6 grid gap-1.5">
                <Link href="/" className="block rounded-lg bg-[#2f604b] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[#244b3a]">
                  Upgrade from workspace settings
                </Link>
                <p className="text-center text-xs text-[#777970]">Workspace → Settings → Billing</p>
              </div>
            )}

            <ul className="mt-6 grid gap-2.5 text-sm text-[#4d4f47]">
              {proTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>

          {/* Institution */}
          <div className="flex flex-col rounded-xl border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#777970]">Institution</p>
              {hasInstitution ? (
                <span className="rounded-full bg-[#e7eee7] px-2.5 py-0.5 text-xs font-semibold text-[#2f604b]">Active ✓</span>
              ) : null}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">$65</span>
              <span className="mb-1 text-sm text-[#66685f]">CAD / workspace / mo</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">For larger teams with compliance needs.</p>

            {!isLoggedIn ? (
              <Link href="/login" className="mt-6 block rounded-lg border border-[#d8d8ce] px-4 py-2.5 text-center text-sm font-semibold text-[#20201d] transition hover:border-[#2f604b] hover:text-[#2f604b]">
                Get started
              </Link>
            ) : hasInstitution ? (
              <Link
                href={institutionWorkspaces.length === 1 ? `/workspaces/${institutionWorkspaces[0].id}/billing` : "/"}
                className="mt-6 block rounded-lg border border-[#d8d8ce] px-4 py-2.5 text-center text-sm font-semibold text-[#20201d] transition hover:border-[#2f604b] hover:text-[#2f604b]"
              >
                Manage subscription
              </Link>
            ) : (
              <div className="mt-6 grid gap-1.5">
                <Link href="/" className="block rounded-lg border border-[#d8d8ce] px-4 py-2.5 text-center text-sm font-semibold text-[#20201d] transition hover:border-[#2f604b] hover:text-[#2f604b]">
                  Upgrade from workspace settings
                </Link>
                <p className="text-center text-xs text-[#777970]">Workspace → Settings → Billing</p>
              </div>
            )}

            <ul className="mt-6 grid gap-2.5 text-sm text-[#4d4f47]">
              {institutionTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>

          {/* Enterprise */}
          <div className="flex flex-col rounded-xl border border-[#d8d8ce] bg-[#f7f7f2] p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#777970]">Enterprise</p>
            <div className="mt-3 flex items-end gap-1">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <p className="mt-2 text-sm text-[#62645c]">Annual contract, SLA, and dedicated support.</p>

            <a
              href="mailto:hello@scribblapp.ca?subject=Scribbl Enterprise inquiry"
              className="mt-6 block rounded-lg border border-[#d8d8ce] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#20201d] transition hover:border-[#2f604b] hover:text-[#2f604b]"
            >
              Contact sales
            </a>

            <ul className="mt-6 grid gap-2.5 text-sm text-[#4d4f47]">
              {enterpriseTierFeatures.map(({ label, included }) => (
                <FeatureRow key={label} label={label} included={included} />
              ))}
            </ul>
          </div>
        </div>

        {/* Comparison table */}
        <section>
          <h2 className="text-center text-2xl font-bold">Full comparison</h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[#d8d8ce] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e2e2d8] bg-[#f7f7f2]">
                  <th className="px-5 py-4 text-left font-semibold text-[#20201d]">Feature</th>
                  <th className="px-5 py-4 text-center font-medium text-[#66685f]">Free</th>
                  <th className="px-5 py-4 text-center font-semibold text-[#2f604b]">Pro</th>
                  <th className="px-5 py-4 text-center font-medium text-[#66685f]">Institution</th>
                  <th className="px-5 py-4 text-center font-medium text-[#66685f]">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, free, pro, institution, enterprise }, i) => (
                  <tr key={feature} className={i < comparisonRows.length - 1 ? "border-b border-[#f1f1eb]" : ""}>
                    <td className="px-5 py-4 font-medium text-[#4d4f47]">{feature}</td>
                    <td className="px-5 py-4 text-center"><CellValue value={free} /></td>
                    <td className="px-5 py-4 text-center"><CellValue value={pro} primary /></td>
                    <td className="px-5 py-4 text-center"><CellValue value={institution} /></td>
                    <td className="px-5 py-4 text-center"><CellValue value={enterprise} /></td>
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
              ["Is billing per user or per workspace?", "Per workspace. Pro includes 20 members and Institution includes 50 — extra members beyond those are billed at $1 CAD/mo (Pro) or $0.50 CAD/mo (Institution) per additional member."],
              ["How do I downgrade or cancel?", "Go to your workspace → Settings → Billing → Open billing portal. Stripe's portal lets you cancel at any time. Your workspace reverts to Free at the end of the billing period — no data is deleted."],
              ["What happens if I cancel?", "Your workspace stays on the paid plan until the end of the current period. After that it reverts to Free — recordings, whiteboards, and group access stop, but all your notes, files, and chat history are preserved."],
              ["How does recording billing work?", "Pro includes 5 hrs/mo of recordings and Institution includes 20 hrs/mo. Additional recording hours are billed at $1.50 CAD/hr, added automatically to your next invoice."],
              ["Are taxes included?", "Prices shown are before tax. Canadian GST/HST is calculated at checkout based on your billing address."],
              ["What payment methods are accepted?", "All major credit and debit cards via Stripe. Enterprise plans are invoiced annually — contact hello@scribblapp.ca."],
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
  { label: "1 workspace", included: true },
  { label: "Up to 3 members", included: true },
  { label: "Video calls", included: true },
  { label: "Text notes", included: true },
  { label: "Chat", included: true },
  { label: "Private whiteboards (solo)", included: true },
  { label: "500 MB shared storage · 200 MB private", included: true },
  { label: "PNG / SVG export", included: true },
  { label: "Shared whiteboards", included: false },
  { label: "Whiteboard PDF export & image uploads", included: false },
  { label: "Meeting recordings", included: false },
  { label: "Groups", included: false },
];

const proTierFeatures = [
  { label: "Unlimited workspaces", included: true },
  { label: "20 members incl. · +$1 CAD/mo per extra", included: true },
  { label: "Video calls", included: true },
  { label: "Text notes", included: true },
  { label: "Chat", included: true },
  { label: "Shared + collaborative whiteboards", included: true },
  { label: "Whiteboard PDF export & image uploads", included: true },
  { label: "10 GB shared · 2 GB private storage", included: true },
  { label: "Recordings — 5 hrs/mo · +$1.50 CAD/hr", included: true },
  { label: "Groups", included: true },
];

const institutionTierFeatures = [
  { label: "Unlimited workspaces", included: true },
  { label: "50 members incl. · +$0.50 CAD/mo per extra", included: true },
  { label: "Everything in Pro", included: true },
  { label: "Recordings — 20 hrs/mo · +$1.50 CAD/hr", included: true },
  { label: "50 GB shared · 5 GB private storage", included: true },
  { label: "Audit log", included: true },
  { label: "Priority support", included: true },
];

const enterpriseTierFeatures = [
  { label: "Custom member limits", included: true },
  { label: "Custom storage", included: true },
  { label: "Custom recording hours", included: true },
  { label: "Everything in Institution", included: true },
  { label: "SLA", included: true },
  { label: "Dedicated support", included: true },
  { label: "Annual contract + invoice billing", included: true },
];

const comparisonRows = [
  { feature: "Price", free: "$0", pro: "$25 CAD/mo", institution: "$65 CAD/mo", enterprise: "Custom" },
  { feature: "Workspaces per owner", free: "1", pro: "Unlimited", institution: "Unlimited", enterprise: "Unlimited" },
  { feature: "Included members", free: "3", pro: "20", institution: "50", enterprise: "Custom" },
  { feature: "Extra members", free: false, pro: "+$1 CAD/mo", institution: "+$0.50 CAD/mo", enterprise: "Custom" },
  { feature: "Video calls", free: true, pro: true, institution: true, enterprise: true },
  { feature: "Text notes", free: true, pro: true, institution: true, enterprise: true },
  { feature: "Private whiteboards (solo)", free: true, pro: true, institution: true, enterprise: true },
  { feature: "Shared whiteboards", free: false, pro: true, institution: true, enterprise: true },
  { feature: "Whiteboard PDF export & image uploads", free: false, pro: true, institution: true, enterprise: true },
  { feature: "Chat", free: true, pro: true, institution: true, enterprise: true },
  { feature: "Notes / text PDF export", free: true, pro: true, institution: true, enterprise: true },
  { feature: "Shared storage", free: "500 MB", pro: "10 GB", institution: "50 GB", enterprise: "Custom" },
  { feature: "Private storage (per user)", free: "200 MB", pro: "2 GB", institution: "5 GB", enterprise: "Custom" },
  { feature: "Recording hours / mo", free: false, pro: "5 hrs", institution: "20 hrs", enterprise: "Custom" },
  { feature: "Recording overages", free: false, pro: "+$1.50/hr", institution: "+$1.50/hr", enterprise: "Custom" },
  { feature: "Groups", free: false, pro: true, institution: true, enterprise: true },
  { feature: "Audit log", free: false, pro: false, institution: true, enterprise: true },
  { feature: "Priority support", free: false, pro: false, institution: true, enterprise: true },
  { feature: "SLA", free: false, pro: false, institution: false, enterprise: true },
];
