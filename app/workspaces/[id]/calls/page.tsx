import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { LocalTime } from "@/components/LocalTime";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { startCall } from "@/app/workspaces/[id]/meetings/actions";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const STALE_CALL_MS = 2 * 60 * 60 * 1000; // 2 hours — calls older than this with no endsAt are considered ended

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CallsPage({ params }: PageProps) {
  const { id: workspaceId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) return <ProtectedPageMessage />;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      members: {
        where: { userId: currentUser.id, status: "ACTIVE" },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!workspace) notFound();
  if (workspace.members.length === 0) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const calls = await prisma.meeting.findMany({
    where: {
      workspaceId,
      type: "ONE_ON_ONE",
      canceledAt: null,
      participants: { some: { userId: currentUser.id } },
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      participants: {
        select: {
          userId: true,
          user: { select: { displayName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[860px] px-6 py-10">

        <header className="mb-8">
          <Link
            href={`/workspaces/${workspaceId}`}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-4 font-display text-3xl font-bold text-[var(--color-text)]">Calls</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Your personal 1:1 call history</p>
        </header>

        {calls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
            <p className="text-sm font-medium text-[var(--color-muted)]">No calls yet</p>
            <p className="mt-1 text-xs text-[var(--color-subtle)]">
              Start a call from a DM or the Members page.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <div className="divide-y divide-[var(--color-border)]">
              {calls.map((call) => {
                const other = call.participants.find((p) => p.userId !== currentUser.id);
                const initials = other?.user.displayName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() ?? "?";
                const isStale = !call.endsAt && (Date.now() - call.startsAt.getTime() > STALE_CALL_MS);
                const duration = call.endsAt
                  ? formatDuration(call.endsAt.getTime() - call.startsAt.getTime())
                  : null;
                const isInProgress = !duration && !isStale;

                return (
                  <div key={call.id} className="flex items-center gap-4 px-6 py-4">
                    {/* Avatar */}
                    <div className="shrink-0">
                      {other?.user.avatarUrl ? (
                        <img
                          src={other.user.avatarUrl}
                          alt={other.user.displayName}
                          className="h-10 w-10 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] font-mono text-sm font-semibold text-[var(--color-secondary)]">
                          {initials}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--color-text)]">
                        {other?.user.displayName ?? "Unknown"}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
                        <LocalTime date={call.startsAt} short />
                      </p>
                    </div>

                    {/* Duration / status */}
                    <div className="shrink-0 text-right">
                      {isInProgress ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-green-700">
                          In progress
                        </span>
                      ) : duration ? (
                        <p className="font-mono text-xs text-[var(--color-muted)]">{duration}</p>
                      ) : (
                        <p className="font-mono text-xs text-[var(--color-subtle)]">Missed</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {!isInProgress && !duration && other ? (
                        <form action={startCall}>
                          <input type="hidden" name="workspaceId" value={workspaceId} />
                          <input type="hidden" name="calleeUserId" value={other.userId} />
                          <PendingSubmitButton
                            pendingLabel="Calling…"
                            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-60"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.26 9.91 19.79 19.79 0 0 1 1.17 1.27 2 2 0 0 1 3.14 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 14.92z"/>
                            </svg>
                            Call back
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                      <Link
                        href={`/workspaces/${workspaceId}/meetings/${call.id}`}
                        className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}
