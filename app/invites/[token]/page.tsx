import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { acceptWorkspaceInvite } from "../actions";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const [currentUser, invite] = await Promise.all([
    getCurrentUser(),
    prisma.workspaceInvite.findUnique({
      where: {
        token,
      },
      include: {
        workspace: true,
        invitedBy: true,
      },
    }),
  ]);

  if (!invite) {
    notFound();
  }

  const isExpired = invite.expiresAt < new Date();
  const isPending = invite.status === "PENDING" && !isExpired;
  const emailMatches = currentUser?.email.toLowerCase() === invite.email;

  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-16 text-[#20201d]">
      <section className="mx-auto max-w-xl rounded-md border border-[#d8d8ce] bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm font-medium text-[#2f604b]">
          Scribbl
        </Link>
        <p className="mt-6 text-sm font-medium uppercase tracking-[0.16em] text-[#6d7f70]">
          Workspace invite
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{invite.workspace.name}</h1>
        <p className="mt-3 text-sm leading-6 text-[#62645c]">
          {invite.invitedBy.displayName} invited {invite.email} as {invite.role.toLowerCase()}.
        </p>

        <div className="mt-6 rounded-md bg-[#fbfbf8] p-4 text-sm leading-6 text-[#4d4f47]">
          {getInviteMessage({
            currentUserEmail: currentUser?.email,
            emailMatches,
            isExpired,
            isPending,
            status: invite.status,
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!currentUser && isPending ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/invites/${token}`)}`}
              className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
            >
              Sign in to accept
            </Link>
          ) : null}

          {currentUser && isPending && emailMatches ? (
            <form action={acceptWorkspaceInvite}>
              <input type="hidden" name="token" value={token} />
              <button className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                Accept Invite
              </button>
            </form>
          ) : null}

          {invite.status === "ACCEPTED" ? (
            <Link
              href={`/workspaces/${invite.workspaceId}`}
              className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
            >
              Open Workspace
            </Link>
          ) : null}
        </div>
      </section>
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
  if (isExpired) {
    return "This invite has expired. Ask the workspace owner to send a new one.";
  }

  if (status === "REVOKED") {
    return "This invite was revoked by the workspace owner.";
  }

  if (status === "ACCEPTED") {
    return "This invite has already been accepted.";
  }

  if (!isPending) {
    return "This invite is no longer available.";
  }

  if (!currentUserEmail) {
    return "Sign in or create an account with the invited email address to join this workspace.";
  }

  if (!emailMatches) {
    return `You are signed in as ${currentUserEmail}. Sign in with the invited email address to accept this invite.`;
  }

  return "Accept this invite to join the workspace.";
}
