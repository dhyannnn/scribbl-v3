import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { getCurrentUser } from "@/lib/current-user";
import { notificationPreferenceDefaults } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { updateNotificationPreferences } from "@/app/notifications/actions";
import { AccountAvatarUploader } from "./AccountAvatarUploader";
import { AppearanceToggle } from "./AppearanceToggle";
import { deleteAccount, signOutAllDevices, updateAccountPassword, updateAccountProfile } from "./actions";
import { createClient } from "@/lib/supabase/server";

type AccountPageProps = {
  searchParams: Promise<{ message?: string }>;
};

const JOB_TITLES = ["Student", "TA / Researcher", "Professor", "Engineer", "Manager", "Other"];

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const [{ message }, currentUser] = await Promise.all([searchParams, getCurrentUser()]);
  if (!currentUser) redirect("/login?next=/account");

  const [headersList, supabase] = await Promise.all([headers(), createClient()]);
  const userAgent = headersList.get("user-agent") ?? "";
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionCreatedAt = sessionData.session?.user?.last_sign_in_at
    ? new Date(sessionData.session.user.last_sign_in_at)
    : null;

  const [ownedWorkspaces, notificationPreference] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: currentUser.id, role: "OWNER", status: "ACTIVE" },
      include: { workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notificationPreference.findUnique({ where: { userId: currentUser.id } }),
  ]);

  const canDeleteAccount = ownedWorkspaces.length === 0;

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[900px] px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            Back to Dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Account Settings</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Manage your profile and personal preferences.</p>
        </div>

        {message && (
          <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
            {message}
          </div>
        )}

        {/* ── Main 2-column grid ──────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_290px] lg:items-start">

          {/* ── LEFT column ──────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Profile card — avatar + personal details form */}
            <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              {/* Avatar header */}
              <div className="flex items-center gap-5 px-6 py-6 border-b border-[var(--color-border)] bg-[var(--color-surface-low)]">
                <AccountAvatarUploader
                  currentAvatarUrl={currentUser.avatarUrl}
                  displayName={currentUser.displayName}
                />
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold text-[var(--color-text)] truncate">
                    {currentUser.displayName}
                  </p>
                  {currentUser.jobTitle && (
                    <p className="mt-0.5 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
                      {currentUser.jobTitle}
                      {currentUser.institution ? ` · ${currentUser.institution}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* Personal details form */}
              <form id="profile-form" action={updateAccountProfile} className="px-6 py-6 space-y-4">
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)] mb-5">
                  Personal Details
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full Name">
                    <Input name="fullName" defaultValue={currentUser.displayName} required placeholder="Your name" />
                  </Field>
                  <Field label="Email Address">
                    <Input name="email" type="email" defaultValue={currentUser.email} required />
                  </Field>
                  <Field label="University / Institution">
                    <Input name="institution" defaultValue={currentUser.institution ?? ""} placeholder="e.g. University of Toronto" />
                  </Field>
                  <Field label="Role">
                    <select
                      name="jobTitle"
                      defaultValue={currentUser.jobTitle ?? ""}
                      className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)]"
                    >
                      <option value="">Select…</option>
                      {JOB_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                </div>
                {currentUser.bio !== null && (
                  <Field label="Bio">
                    <textarea
                      name="bio"
                      defaultValue={currentUser.bio ?? ""}
                      rows={3}
                      placeholder="A short bio visible to your workspace members…"
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] placeholder:text-[var(--color-subtle)] resize-none"
                    />
                  </Field>
                )}
                <div className="pt-2">
                  <PendingSubmitButton
                    pendingLabel="Saving…"
                    className="w-full rounded-full bg-[var(--color-secondary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-50"
                  >
                    Save Changes
                  </PendingSubmitButton>
                </div>
              </form>
            </section>

            {/* Security & Password */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-6">
              <div className="flex items-center gap-2 mb-5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Security &amp; Password</h2>
              </div>
              <form action={updateAccountPassword} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="New Password">
                    <Input name="password" type="password" required minLength={6} placeholder="············" />
                  </Field>
                </div>
                <PendingSubmitButton
                  pendingLabel="Updating…"
                  className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
                >
                  Update Password
                </PendingSubmitButton>
              </form>
            </section>

            {/* Danger zone */}
            <section className="rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-surface)] px-6 py-6">
              <h2 className="mb-1 font-display text-base font-semibold text-[var(--color-danger)]">Delete Account</h2>
              <p className="mb-5 text-sm text-[var(--color-muted)]">
                Permanently removes your login, removes you from all workspaces, and anonymizes your shared content.
              </p>
              {ownedWorkspaces.length > 0 && (
                <div className="mb-4 rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
                  <p className="font-medium">Blocked — transfer ownership of these workspaces first:</p>
                  <ul className="mt-2 space-y-1">
                    {ownedWorkspaces.map((m) => (
                      <li key={m.id}>
                        <Link href={`/workspaces/${m.workspace.id}/members`} className="font-semibold underline underline-offset-2">
                          {m.workspace.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <form action={deleteAccount} className="flex flex-wrap items-end gap-3">
                <label className="grid flex-1 gap-1.5 min-w-[160px]">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Type DELETE to confirm</span>
                  <input
                    name="confirmation"
                    required
                    pattern="DELETE"
                    disabled={!canDeleteAccount}
                    className="h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition focus:border-[var(--color-danger)] disabled:opacity-40"
                  />
                </label>
                <PendingSubmitButton
                  disabled={!canDeleteAccount}
                  pendingLabel="Deleting…"
                  className="h-10 rounded-full bg-[var(--color-danger)] px-5 text-sm font-medium text-white transition hover:opacity-80 disabled:opacity-40"
                >
                  Delete Account
                </PendingSubmitButton>
              </form>
            </section>
          </div>

          {/* ── RIGHT column ─────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Notifications */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Notifications</p>
              <form action={updateNotificationPreferences} className="space-y-2">
                <Toggle name="announcements" label="Announcements" description="Workspace-wide posts."
                  defaultChecked={notificationPreference?.announcements ?? notificationPreferenceDefaults.announcements} />
                <Toggle name="meetings" label="Meeting updates" description="Scheduled, changed, or cancelled."
                  defaultChecked={notificationPreference?.meetings ?? notificationPreferenceDefaults.meetings} />
                <Toggle name="files" label="Shared files" description="Files added to workspaces."
                  defaultChecked={notificationPreference?.files ?? notificationPreferenceDefaults.files} />
                <Toggle name="notes" label="Shared notes" description="Notes shared with the workspace."
                  defaultChecked={notificationPreference?.notes ?? notificationPreferenceDefaults.notes} />
                <Toggle name="chatMessages" label="Chat messages" description="Off by default."
                  defaultChecked={notificationPreference?.chatMessages ?? notificationPreferenceDefaults.chatMessages} />
                <div className="pt-1">
                  <PendingSubmitButton
                    pendingLabel="Saving…"
                    className="w-full rounded-full border border-[var(--color-border)] py-2 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
                  >
                    Save preferences
                  </PendingSubmitButton>
                </div>
              </form>
            </section>

            {/* Appearance */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Appearance</p>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Dark mode</p>
                  <p className="text-xs text-[var(--color-muted)]">Switch between light and dark interface.</p>
                </div>
                <AppearanceToggle initialDark={currentUser.darkMode} />
              </div>
            </section>

            {/* Workspaces */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5">
              <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Your Workspaces</p>
              <div className="space-y-2">
                {ownedWorkspaces.length === 0 ? (
                  <p className="text-xs text-[var(--color-subtle)]">You don&apos;t own any workspaces.</p>
                ) : (
                  ownedWorkspaces.map((m) => (
                    <Link
                      key={m.id}
                      href={`/workspaces/${m.workspace.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm transition hover:bg-[var(--color-surface-low)]"
                    >
                      <span className="font-medium text-[var(--color-text)]">{m.workspace.name}</span>
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Owner</span>
                    </Link>
                  ))
                )}
                <Link
                  href="/"
                  className="block pt-1 text-xs font-medium text-[var(--color-secondary)] hover:underline"
                >
                  View all workspaces →
                </Link>
              </div>
            </section>

            {/* Sessions & Devices */}
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5">
              <p className="mb-4 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">Sessions &amp; Devices</p>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                    {isMobile(userAgent) ? <PhoneIcon /> : <DesktopIcon />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      {getBrowser(userAgent)} on {getOS(userAgent)}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {sessionCreatedAt
                        ? `Last sign-in ${timeAgo(sessionCreatedAt)}`
                        : "Current session"}
                      {" · "}
                      <span className="text-[var(--color-success)] font-medium">Active now</span>
                    </p>
                  </div>
                </div>
              </div>
              <form action={signOutAllDevices} className="mt-3">
                <button
                  type="submit"
                  className="w-full rounded-full border border-[var(--color-danger-dim)] bg-[var(--color-surface)] py-2 text-xs font-medium text-[var(--color-danger)] transition hover:bg-[var(--color-danger-dim)]"
                >
                  Sign out all devices
                </button>
              </form>
            </section>

            {/* Need Assistance */}
            <div className="rounded-2xl bg-[var(--color-live)] p-5 text-white">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <p className="font-semibold">Need Assistance?</p>
              </div>
              <p className="mb-4 text-sm text-white/70">
                Browse guides, keyboard shortcuts, and FAQs in our documentation.
              </p>
              <Link
                href="/help"
                className="block w-full rounded-full bg-[var(--color-secondary)] py-2 text-center text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
              >
                Support Center
              </Link>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}

// ── Session helpers ──────────────────────────────────────────────────────────

function getBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

function getOS(ua: string): string {
  if (/iPhone|iPad/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
}

function isMobile(ua: string): boolean {
  return /iPhone|iPad|Android|Mobile/.test(ua);
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DesktopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] placeholder:text-[var(--color-subtle)] disabled:opacity-50"
    />
  );
}

function Toggle({ name, label, description, defaultChecked }: {
  name: string; label: string; description: string; defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2.5 transition hover:bg-[var(--color-surface-mid)]">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--color-text)]">{label}</span>
        <span className="block text-xs text-[var(--color-muted)]">{description}</span>
      </span>
      <span className="relative shrink-0">
        <input name={name} type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="block h-6 w-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-high)] transition peer-checked:border-[var(--color-secondary)] peer-checked:bg-[var(--color-secondary)]" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}
