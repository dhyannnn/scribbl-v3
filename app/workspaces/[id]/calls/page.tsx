import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

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
                const duration = call.endsAt
                  ? formatDuration(call.endsAt.getTime() - call.startsAt.getTime())
                  : null;

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
                        {call.startsAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {" · "}
                        {call.startsAt.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    {/* Duration */}
                    <div className="shrink-0 text-right">
                      {duration ? (
                        <p className="font-mono text-xs text-[var(--color-muted)]">{duration}</p>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-green-700">
                          In progress
                        </span>
                      )}
                    </div>

                    {/* Link */}
                    <Link
                      href={`/workspaces/${workspaceId}/meetings/${call.id}`}
                      className="shrink-0 rounded-full border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                    >
                      View
                    </Link>
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
