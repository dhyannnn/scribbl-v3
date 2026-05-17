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
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
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
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    email: true,
                  },
                },
              },
            },
            _count: {
              select: {
                meetings: {
                  where: {
                    canceledAt: null,
                    startsAt: { gt: new Date() },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!workspace) {
    notFound();
  }

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

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

  // Build a set of userIds already in each group for quick lookup in the add-member dropdown
  const memberGroupMap = new Map(
    workspace.groups.map((g) => [g.id, new Set(g.members.map((m) => m.userId))]),
  );

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                workspace groups
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#171713] sm:text-3xl lg:text-4xl">
                Groups
              </h1>
              <p className="mt-3 text-base leading-7 text-[#62645c]">
                Divide workspace members into sub-teams. Meetings scoped to a group only notify that group.
              </p>
            </div>
            <div className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-xs font-medium text-[#686a62]">Groups</p>
              <p className="mt-1 text-2xl font-semibold">{workspace.groups.length}</p>
            </div>
          </div>
        </header>

        {!isPro ? (
          <div className="rounded-md border border-[#e2d8c8] bg-[#fffaf5] p-6 shadow-sm">
            <p className="font-semibold text-[#7a5a1f]">Groups are a Pro feature</p>
            <p className="mt-2 text-sm leading-6 text-[#7a5a1f]">
              Upgrade this workspace to Pro to create groups, scope meetings to sub-teams, and send targeted notifications.
            </p>
            <Link
              href={`/workspaces/${workspace.id}/billing`}
              className="mt-4 inline-block rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
            >
              Upgrade to Pro →
            </Link>
          </div>
        ) : (
          <>
            {getGroupStatusMessage(groupStatus) ? (
              <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
                {getGroupStatusMessage(groupStatus)}
              </p>
            ) : null}

            {canManageGroups ? (
              <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold">Create Group</h2>
                <form action={createGroup} className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Name</span>
                    <input
                      name="name"
                      required
                      placeholder="Mon 12pm, Engineering, Section A..."
                      className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                    />
                  </label>
                  <div className="flex items-end">
                    <PendingSubmitButton
                      pendingLabel="Creating..."
                      className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                    >
                      Create Group
                    </PendingSubmitButton>
                  </div>
                  <label className="grid gap-2 lg:col-span-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Description (optional)</span>
                    <input
                      name="description"
                      placeholder="Monday 12pm section, Frontend team..."
                      className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                    />
                  </label>
                </form>
              </section>
            ) : null}

            <section className="grid gap-4">
              {workspace.groups.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#c8c8bd] bg-white p-8 text-center text-sm text-[#66685f]">
                  {canManageGroups
                    ? "No groups yet. Use the form above to create your first group."
                    : "No groups have been created for this workspace yet."}
                </div>
              ) : null}

              {workspace.groups.map((group) => {
                const groupMemberIds = memberGroupMap.get(group.id) ?? new Set<string>();
                const nonMembers = workspace.members.filter((m) => !groupMemberIds.has(m.userId));

                return (
                  <div key={group.id} className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{group.name}</h2>
                          <span className="rounded-md bg-[#e7eee7] px-2 py-0.5 text-xs font-medium text-[#2f604b]">
                            {group.members.length} member{group.members.length === 1 ? "" : "s"}
                          </span>
                          {group._count.meetings > 0 ? (
                            <span className="rounded-md bg-[#eef3f8] px-2 py-0.5 text-xs font-medium text-[#2f4f66]">
                              {group._count.meetings} upcoming meeting{group._count.meetings === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>
                        {group.description ? (
                          <p className="mt-1 text-sm text-[#66685f]">{group.description}</p>
                        ) : null}
                      </div>
                      {canManageGroups ? (
                        <form action={deleteGroup}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="groupId" value={group.id} />
                          <PendingSubmitButton
                            pendingLabel="Deleting..."
                            className="rounded-md border border-[#c8c8bd] px-3 py-1.5 text-xs font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {group._count.meetings > 0
                              ? `Delete (${group._count.meetings} meeting${group._count.meetings === 1 ? "" : "s"} will become workspace-wide)`
                              : "Delete Group"}
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                    </div>

                    {/* Members in this group */}
                    <div className="mt-4 border-t border-[#e6e6dc] pt-4">
                      {group.members.length > 0 ? (
                        <div className="grid gap-2">
                          {group.members.map((gm) => (
                            <div key={gm.userId} className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{gm.user.displayName}</p>
                                <p className="truncate text-xs text-[#777970]">{gm.user.email}</p>
                              </div>
                              {canManageGroups ? (
                                <form action={removeGroupMember}>
                                  <input type="hidden" name="workspaceId" value={workspace.id} />
                                  <input type="hidden" name="groupId" value={group.id} />
                                  <input type="hidden" name="userId" value={gm.userId} />
                                  <PendingSubmitButton
                                    pendingLabel="Removing..."
                                    className="shrink-0 rounded-md border border-[#c8c8bd] px-2.5 py-1 text-xs font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remove
                                  </PendingSubmitButton>
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#66685f]">No members in this group yet.</p>
                      )}

                      {canManageGroups && nonMembers.length > 0 ? (
                        <form action={addGroupMember} className="mt-3 flex gap-2">
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="groupId" value={group.id} />
                          <select
                            name="userId"
                            required
                            className="min-h-9 flex-1 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
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
                            className="min-h-9 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Add
                          </PendingSubmitButton>
                        </form>
                      ) : canManageGroups && nonMembers.length === 0 && workspace.members.length > 0 ? (
                        <p className="mt-3 text-xs text-[#66685f]">All workspace members are already in this group.</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Current user's group membership — shown to all members */}
            <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Your Groups</h2>
              {(() => {
                const myGroups = workspace.groups.filter((g) =>
                  g.members.some((m) => m.userId === currentUser.id),
                );
                return myGroups.length > 0 ? (
                  <div className="mt-4 grid gap-2">
                    {myGroups.map((g) => (
                      <div key={g.id} className="flex items-center gap-2">
                        <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
                          {g.name}
                        </span>
                        {g.description ? (
                          <span className="text-sm text-[#66685f]">{g.description}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[#66685f]">You have not been added to any group yet.</p>
                );
              })()}
            </section>
          </>
        )}
      </div>
    </main>
  );
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
