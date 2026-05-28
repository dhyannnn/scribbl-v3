import Link from "next/link";
import { Check, X, Zap, Building2, Users, Star } from "lucide-react";
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
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">

      {/* Hero */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-secondary)] hover:underline">
                ← Back to Scribbl
              </Link>
              <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
                Simple, transparent pricing
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted)]">
                Per workspace, not per seat. Start free — upgrade when your team grows.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-5 lg:w-72">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                  <Zap size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Cancel anytime</p>
                  <p className="text-xs text-[var(--color-muted)]">No lock-in, no contracts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                  <Users size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">Per workspace</p>
                  <p className="text-xs text-[var(--color-muted)]">One price, many members</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                  <Star size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">CAD pricing</p>
                  <p className="text-xs text-[var(--color-muted)]">Canadian taxes calculated at checkout</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-14 sm:px-8 lg:px-10">

        {/* Current plan banner */}
        {isLoggedIn && hasPaid ? (
          <div className="rounded-2xl border border-[var(--color-secondary-dim)] bg-[var(--color-secondary-dim)] px-5 py-4">
            <p className="text-sm font-semibold text-[var(--color-secondary)]">
              {hasInstitution
                ? `You have ${institutionWorkspaces.length} Institution workspace${institutionWorkspaces.length > 1 ? "s" : ""}: ${institutionWorkspaces.map((w) => w.name).join(", ")}.`
                : `You have ${proWorkspaces.length} Pro workspace${proWorkspaces.length > 1 ? "s" : ""}: ${proWorkspaces.map((w) => w.name).join(", ")}.`}
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              To manage billing, update payment, or cancel — open your workspace and go to{" "}
              <strong>Settings → Billing → Open billing portal</strong>.
            </p>
          </div>
        ) : null}

        {/* Tier cards */}
        <section>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

            {/* Free */}
            <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">Free</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-[var(--color-text)]">$0</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">Try Scribbl with a small group.</p>

              <div className="mt-5">
                {!isLoggedIn ? (
                  <Link href="/login" className="block rounded-full border border-[var(--color-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]">
                    Get started free
                  </Link>
                ) : !hasPaid ? (
                  <div className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-secondary-dim)] bg-[var(--color-secondary-dim)] px-4 py-2.5">
                    <span className="h-2 w-2 rounded-full bg-[var(--color-secondary)]" />
                    <span className="text-sm font-semibold text-[var(--color-secondary)]">Current plan</span>
                  </div>
                ) : (
                  <Link href="/" className="block rounded-full border border-[var(--color-border)] px-4 py-2.5 text-center text-sm text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]">
                    Go to dashboard
                  </Link>
                )}
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm text-[var(--color-muted)]">
                {freeTierFeatures.map(({ label, included }) => (
                  <FeatureRow key={label} label={label} included={included} />
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className="relative flex flex-col rounded-2xl border-2 border-[var(--color-secondary)] bg-[var(--color-surface)] p-6 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-secondary)]">Pro</p>
                <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-secondary)]">
                  {hasPro ? "Active ✓" : "Most popular"}
                </span>
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-[var(--color-text)]">$25</span>
                <span className="mb-1 text-sm text-[var(--color-muted)]">CAD / workspace / mo</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">Everything your team needs.</p>

              <div className="mt-5">
                {!isLoggedIn ? (
                  <Link href="/login" className="block rounded-full bg-[var(--color-secondary)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]">
                    Get started
                  </Link>
                ) : hasPro ? (
                  <Link
                    href={proWorkspaces.length === 1 ? `/workspaces/${proWorkspaces[0].id}/billing` : "/"}
                    className="block rounded-full bg-[var(--color-secondary)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
                  >
                    Manage subscription
                  </Link>
                ) : (
                  <div className="grid gap-1.5">
                    <Link href="/" className="block rounded-full bg-[var(--color-secondary)] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]">
                      Upgrade from workspace settings
                    </Link>
                    <p className="text-center text-xs text-[var(--color-subtle)]">Workspace → Settings → Billing</p>
                  </div>
                )}
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm text-[var(--color-muted)]">
                {proTierFeatures.map(({ label, included }) => (
                  <FeatureRow key={label} label={label} included={included} primary />
                ))}
              </ul>
            </div>

            {/* Institution */}
            <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">Institution</p>
                {hasInstitution ? (
                  <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-secondary)]">Active ✓</span>
                ) : null}
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-[var(--color-text)]">$65</span>
                <span className="mb-1 text-sm text-[var(--color-muted)]">CAD / workspace / mo</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">For larger teams with compliance needs.</p>

              <div className="mt-5">
                {!isLoggedIn ? (
                  <Link href="/login" className="block rounded-full border border-[var(--color-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]">
                    Get started
                  </Link>
                ) : hasInstitution ? (
                  <Link
                    href={institutionWorkspaces.length === 1 ? `/workspaces/${institutionWorkspaces[0].id}/billing` : "/"}
                    className="block rounded-full border border-[var(--color-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                  >
                    Manage subscription
                  </Link>
                ) : (
                  <div className="grid gap-1.5">
                    <Link href="/" className="block rounded-full border border-[var(--color-border)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]">
                      Upgrade from workspace settings
                    </Link>
                    <p className="text-center text-xs text-[var(--color-subtle)]">Workspace → Settings → Billing</p>
                  </div>
                )}
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm text-[var(--color-muted)]">
                {institutionTierFeatures.map(({ label, included }) => (
                  <FeatureRow key={label} label={label} included={included} />
                ))}
              </ul>
            </div>

            {/* Enterprise */}
            <div className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="shrink-0 text-[var(--color-subtle)]" />
                <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">Enterprise</p>
              </div>
              <div className="mt-3 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-[var(--color-text)]">Custom</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">Annual contract, SLA, and dedicated support.</p>

              <div className="mt-5">
                <a
                  href="mailto:billing@scribblapp.ca?subject=Scribbl Enterprise inquiry"
                  className="block rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  Contact sales
                </a>
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm text-[var(--color-muted)]">
                {enterpriseTierFeatures.map(({ label, included }) => (
                  <FeatureRow key={label} label={label} included={included} />
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--color-text)]">Full comparison</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">See exactly what each plan includes.</p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-low)]">
                  <th className="px-5 py-4 text-left font-semibold text-[var(--color-text)]">Feature</th>
                  <th className="px-5 py-4 text-center font-medium text-[var(--color-muted)]">Free</th>
                  <th className="px-5 py-4 text-center font-semibold text-[var(--color-secondary)]">Pro</th>
                  <th className="px-5 py-4 text-center font-medium text-[var(--color-muted)]">Institution</th>
                  <th className="px-5 py-4 text-center font-medium text-[var(--color-muted)]">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ feature, free, pro, institution, enterprise }, i) => (
                  <tr
                    key={feature}
                    className={`${i < comparisonRows.length - 1 ? "border-b border-[var(--color-border)]" : ""} transition hover:bg-[var(--color-surface-low)]`}
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--color-text)]">{feature}</td>
                    <td className="px-5 py-3.5 text-center"><CellValue value={free} /></td>
                    <td className="px-5 py-3.5 text-center"><CellValue value={pro} primary /></td>
                    <td className="px-5 py-3.5 text-center"><CellValue value={institution} /></td>
                    <td className="px-5 py-3.5 text-center"><CellValue value={enterprise} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ — 2 columns on lg */}
        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--color-text)]">Good to know</h2>
          <dl className="mt-6 grid gap-6 lg:grid-cols-2">
            {[
              ["Is billing per user or per workspace?", "Per workspace. Pro includes 20 members and Institution includes 50 — extra members beyond those are billed at $1 CAD/mo (Pro) or $0.50 CAD/mo (Institution) per additional member."],
              ["How do I downgrade or cancel?", "Go to your workspace → Settings → Billing → Open billing portal. Stripe's portal lets you cancel at any time. Your workspace reverts to Free at the end of the billing period — no data is deleted."],
              ["What happens if I cancel?", "Your workspace stays on the paid plan until the end of the current period. After that it reverts to Free — recordings, whiteboards, and group access stop, but all your notes, files, and chat history are preserved."],
              ["How does recording billing work?", "Pro includes 5 hrs/mo of recordings and Institution includes 20 hrs/mo. Additional recording hours are billed at $1.50 CAD/hr, added automatically to your next invoice."],
              ["Are taxes included?", "Prices shown are before tax. Canadian GST/HST is calculated at checkout based on your billing address."],
              ["What payment methods are accepted?", "All major credit and debit cards via Stripe. Enterprise plans are invoiced annually — contact billing@scribblapp.ca."],
            ].map(([q, a]) => (
              <div key={String(q)} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
                <dt className="font-semibold text-[var(--color-text)]">{q}</dt>
                <dd className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{a}</dd>
              </div>
            ))}
          </dl>
        </section>

      </div>
    </main>
  );
}

function FeatureRow({ label, included, primary = false }: { label: string; included: boolean | string; primary?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {included === true ? (
        <span className={`mt-0.5 shrink-0 ${primary ? "text-[var(--color-secondary)]" : "text-[var(--color-success)]"}`}>✓</span>
      ) : included === false ? (
        <span className="mt-0.5 shrink-0 text-[var(--color-border-strong)]">✗</span>
      ) : (
        <span className="mt-0.5 shrink-0 text-[var(--color-warning)]">~</span>
      )}
      <span className={included === false ? "text-[var(--color-subtle)]" : ""}>{label}</span>
    </li>
  );
}

function CellValue({ value, primary = false }: { value: boolean | string; primary?: boolean }) {
  if (value === true) {
    return (
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${primary ? "bg-[var(--color-secondary)] text-white" : "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"}`}>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-high)] text-[var(--color-border-strong)]">
        <X size={13} strokeWidth={2.5} />
      </span>
    );
  }
  return <span className="text-xs font-medium text-[var(--color-muted)]">{value}</span>;
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
