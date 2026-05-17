import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { addGroupMember, createGroup, deleteGroup, removeGroupMember } from "./actions";

type GroupsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
};

export default async function GroupsPage({ params, searchParams }: GroupsPageProps) {
  const { id } = await params;
  const { group: groupStatus } = await searchParams;

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        plan: true,
        members: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            userId: true,
            role: true,
            user: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        groups: {
          select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            members: {
              select: {
                userId: true,
                user: { select: { id: true, displayName: true, email: true } },
              },
            },
            _count: {
              select: {
                meetings: { where: { canceledAt: null, startsAt: { gt: new Date() } } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!workspace) notFound();
  if (!currentUser) return <ProtectedPageMessage />;

  const currentMembership = workspace.members.find((m) => m.userId === currentUser.id);
  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const canManageGroups = currentMembership.role === "OWNER" || currentMembership.role === "ADMIN";
  const isPro = workspace.plan !== "FREE";

  const memberGroupMap = new Map(
    workspace.groups.map((g) => [g.id, new Set(g.members.map((m) => m.userId))]),
  );

  const myGroups = workspace.groups.filter((g) =>
    g.members.some((m) => m.userId === currentUser.id),
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[900px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <Link
            href={`/workspaces/${workspace.id}`}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
                Groups
              </h1>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Divide members into sub-teams. Meetings scoped to a group only notify that group.
              </p>
            </div>
            <div className="shrink-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-center shadow-sm">
              <p className="font-display text-2xl font-bold text-[var(--color-text)]">{workspace.groups.length}</p>
              <p className="font-mono text-xs text-[var(--color-subtle)]">Groups</p>
            </div>
          </div>
        </header>

        {!isPro ? (
          <div className="rounded-2xl border border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] p-6">
            <p className="font-semibold text-[var(--color-warning)]">Groups are a Pro feature</p>
            <p className="mt-2 text-sm text-[var(--color-warning)]">
              Upgrade this workspace to Pro to create groups, scope meetings to sub-teams, and send targeted notifications.
            </p>
            <Link
              href={`/workspaces/${workspace.id}/billing`}
              className="mt-4 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80"
            >
              Upgrade to Pro →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {getGroupStatusMessage(groupStatus) ? (
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
                {getGroupStatusMessage(groupStatus)}
              </p>
            ) : null}

            {/* Your groups */}
            {myGroups.length > 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-[var(--color-subtle)]">Your groups</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {myGroups.map((g) => (
                    <span key={g.id} className="rounded-full bg-[var(--color-secondary-dim)] px-3 py-1 font-mono text-xs font-semibold text-[var(--color-secondary)]">
                      {g.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Create group form */}
            {canManageGroups ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
                <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">Create group</h2>
                <form action={createGroup} className="mt-5 flex flex-col gap-4">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "180px" }}>
                      <span className="text-xs font-medium text-[var(--color-muted)]">Name</span>
                      <input
                        name="name"
                        required
                        placeholder="Mon 12pm, Engineering, Section A..."
                        className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                      />
                    </label>
                    <PendingSubmitButton
                      pendingLabel="Creating..."
                      className="min-h-10 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                    >
                      Create
                    </PendingSubmitButton>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--color-muted)]">Description (optional)</span>
                    <input
                      name="description"
                      placeholder="Monday 12pm section, Frontend team..."
                      className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                    />
                  </label>
                </form>
              </div>
            ) : null}

            {/* Groups list */}
            {workspace.groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
                <p className="text-sm text-[var(--color-subtle)]">
                  {canManageGroups
                    ? "No groups yet. Use the form above to create your first group."
                    : "No groups have been created for this workspace yet."}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              {workspace.groups.map((group) => {
                const groupMemberIds = memberGroupMap.get(group.id) ?? new Set<string>();
                const nonMembers = workspace.members.filter((m) => !groupMemberIds.has(m.userId));

                return (
                  <div key={group.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
                    {/* Group header */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-semibold text-[var(--color-text)]">
                            {group.name}
                          </h3>
                          <span className="rounded-full bg-[var(--color-surface-high)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                            {group.members.length} member{group.members.length === 1 ? "" : "s"}
                          </span>
                          {group._count.meetings > 0 ? (
                            <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
                              {group._count.meetings} upcoming
                            </span>
                          ) : null}
                        </div>
                        {group.description ? (
                          <p className="mt-1 text-sm text-[var(--color-muted)]">{group.description}</p>
                        ) : null}
                      </div>

                      {canManageGroups ? (
                        <form action={deleteGroup}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="groupId" value={group.id} />
                          <PendingSubmitButton
                            pendingLabel="Deleting..."
                            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] disabled:opacity-50"
                          >
                            {group._count.meetings > 0 ? "Delete group" : "Delete"}
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                    </div>

                    {/* Members */}
                    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                      {group.members.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {group.members.map((gm) => (
                            <div key={gm.userId} className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-high)] font-mono text-xs font-semibold text-[var(--color-muted)]">
                                  {getInitials(gm.user.displayName)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{gm.user.displayName}</p>
                                  <p className="truncate text-xs text-[var(--color-subtle)]">{gm.user.email}</p>
                                </div>
                              </div>
                              {canManageGroups ? (
                                <form action={removeGroupMember}>
                                  <input type="hidden" name="workspaceId" value={workspace.id} />
                                  <input type="hidden" name="groupId" value={group.id} />
                                  <input type="hidden" name="userId" value={gm.userId} />
                                  <PendingSubmitButton
                                    pendingLabel="Removing..."
                                    className="shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] disabled:opacity-50"
                                  >
                                    Remove
                                  </PendingSubmitButton>
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--color-subtle)]">No members in this group yet.</p>
                      )}

                      {canManageGroups && nonMembers.length > 0 ? (
                        <form action={addGroupMember} className="mt-3 flex gap-2">
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="groupId" value={group.id} />
                          <select
                            name="userId"
                            required
                            className="min-h-9 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                          >
                            <option value="">Add a member...</option>
                            {nonMembers.map((m) => (
                              <option key={m.userId} value={m.userId}>
                                {m.user.displayName} ({m.user.email})
                              </option>
                            ))}
                          </select>
                          <PendingSubmitButton
                            pendingLabel="Adding..."
                            className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                          >
                            Add
                          </PendingSubmitButton>
                        </form>
                      ) : canManageGroups && nonMembers.length === 0 && workspace.members.length > 0 ? (
                        <p className="mt-3 text-xs text-[var(--color-subtle)]">All workspace members are already in this group.</p>
                      ) : null}
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getGroupStatusMessage(status?: string) {
  switch (status) {
    case "created":
      return "Group created.";
    case "deleted":
      return "Group deleted. Meetings scoped to that group are now workspace-wide.";
    case "member-added":
      return "Member added to group.";
    case "member-removed":
      return "Member removed from group.";
    case "invalid":
      return "Check the details and try again.";
    case "unauthorized":
      return "Only workspace owners and admins can manage groups.";
    case "plan-limit":
      return "Groups require a Pro workspace.";
    case "rate-limited":
      return "Too many requests. Please wait a moment and try again.";
    case "not-found":
      return "Group not found.";
    case "member-not-found":
      return "That member is not active in this workspace.";
    default:
      return null;
  }
}
