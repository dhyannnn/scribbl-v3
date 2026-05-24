export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { acceptWorkspaceInvite } from "../actions";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  const [currentUser, invite] = await Promise.all([
    getCurrentUser(),
    prisma.workspaceInvite.findUnique({
      where: { token },
      include: { workspace: true, invitedBy: true },
    }),
  ]);

  if (!invite) notFound();

  const isExpired = invite.expiresAt < new Date();
  const isPending = invite.status === "PENDING" && !isExpired;
  const emailMatches = currentUser?.email.toLowerCase() === invite.email;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-5 py-16 text-[var(--color-text)]">
      <div className="mx-auto max-w-lg">
        {/* Logo */}
        <Link href="/" className="mb-8 flex items-center">
          <div className="rounded-full bg-white px-4 py-2 shadow-sm">
            <img src="/scribbl-logo.png" alt="Scribbl" className="h-8 w-auto object-contain" />
          </div>
        </Link>

        {/* Card */}
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            Workspace invite
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)]">
            {invite.workspace.name}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
            {invite.invitedBy.displayName} invited {invite.email} as {invite.role.toLowerCase()}.
          </p>

          <div className={`mt-6 rounded-xl border p-4 text-sm leading-6 ${
            error === "limit-reached"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-muted)]"
          }`}>
            {error === "limit-reached"
              ? "This workspace has reached its Free plan member limit (3 members). Ask the workspace owner to upgrade to Pro to add more members."
              : getInviteMessage({ currentUserEmail: currentUser?.email, emailMatches, isExpired, isPending, status: invite.status })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!currentUser && isPending ? (
              <Link
                href={`/login?next=${encodeURIComponent(`/invites/${token}`)}`}
                className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Sign in to accept
              </Link>
            ) : null}

            {currentUser && isPending && emailMatches ? (
              <form action={acceptWorkspaceInvite}>
                <input type="hidden" name="token" value={token} />
                <button className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                  Accept invite
                </button>
              </form>
            ) : null}

            {invite.status === "ACCEPTED" ? (
              <Link
                href={`/workspaces/${invite.workspaceId}`}
                className="rounded-full bg-[var(--color-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Open workspace
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function getInviteMessage({
  currentUserEmail,
  emailMatches,
  isExpired,
  isPending,
  status,
}: {
  currentUserEmail?: string;
  emailMatches: boolean;
  isExpired: boolean;
  isPending: boolean;
  status: string;
}) {
  if (isExpired) return "This invite has expired. Ask the workspace owner to send a new one.";
  if (status === "REVOKED") return "This invite was revoked by the workspace owner.";
  if (status === "ACCEPTED") return "This invite has already been accepted.";
  if (!isPending) return "This invite is no longer available.";
  if (!currentUserEmail) return "Sign in or create an account with the invited email address to join this workspace.";
  if (!emailMatches) return `You are signed in as ${currentUserEmail}. Sign in with the invited email address to accept this invite.`;
  return "Accept this invite to join the workspace.";
}
