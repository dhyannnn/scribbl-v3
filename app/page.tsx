import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser, getSupabaseAuthUser } from "@/lib/current-user";
import {
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
  type MeetingLifecycleState,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { signOut } from "./auth/actions";
import { createWorkspace } from "./actions";
import { acceptWorkspaceInvite } from "./invites/actions";

const DASHBOARD_RECENT_LIMIT = 6;

export default async function Home() {
  const [currentUser, authUser] = await Promise.all([getCurrentUser(), getSupabaseAuthUser()]);
  const now = new Date();
  const fallbackLiveStartsAt = new Date(now.getTime() - 60 * 60 * 1000);

  const user = currentUser
    ? await prisma.user.findUnique({
        where: {
          id: currentUser.id,
        },
        select: {
          displayName: true,
          memberships: {
            where: {
              status: "ACTIVE",
            },
            select: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  description: true,
                  _count: {
                    select: {
                      channels: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  const workspaces = user?.memberships.map((membership) => membership.workspace) ?? [];
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const [pendingInvites, recentMessageRows, recentNoteRows, upcomingMeetingRows] = currentUser
    ? await Promise.all([
      prisma.workspaceInvite.findMany({
        where: {
          email: currentUser.email,
          status: "PENDING",
          expiresAt: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
          token: true,
          role: true,
          expiresAt: true,
          workspace: {
            select: {
              name: true,
            },
          },
          invitedBy: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      workspaceIds.length > 0
        ? prisma.message.findMany({
            where: {
              deletedAt: null,
              channel: {
                workspaceId: {
                  in: workspaceIds,
                },
              },
            },
            select: {
              id: true,
              body: true,
              sender: {
                select: {
                  displayName: true,
                },
              },
              channel: {
                select: {
                  id: true,
                  name: true,
                  workspaceId: true,
                  workspace: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: DASHBOARD_RECENT_LIMIT,
          })
        : [],
      workspaceIds.length > 0
        ? prisma.note.findMany({
            where: {
              workspaceId: {
                in: workspaceIds,
              },
              deletedAt: null,
              OR: [
                {
                  visibility: "WORKSPACE_SHARED",
                },
                {
                  visibility: "PRIVATE",
                  ownerUserId: currentUser.id,
                },
              ],
            },
            select: {
              id: true,
              workspaceId: true,
              title: true,
              type: true,
              updatedAt: true,
              workspace: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: {
              updatedAt: "desc",
            },
            take: DASHBOARD_RECENT_LIMIT,
          })
        : [],
      workspaceIds.length > 0
        ? prisma.meeting.findMany({
            where: {
              workspaceId: {
                in: workspaceIds,
              },
              canceledAt: null,
              OR: [
                {
                  startsAt: {
                    gte: fallbackLiveStartsAt,
                  },
                },
                {
                  endsAt: {
                    gte: now,
                  },
                },
              ],
            },
            select: {
              id: true,
              workspaceId: true,
              title: true,
              startsAt: true,
              endsAt: true,
              canceledAt: true,
              workspace: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: {
              startsAt: "asc",
            },
            take: 3,
          })
        : [],
    ])
    : [[], [], [], []];
  const recentMessages = recentMessageRows.map((message) => ({
    id: message.id,
    body: message.body,
    sender: message.sender,
    channelId: message.channel.id,
    channelName: message.channel.name,
    workspaceId: message.channel.workspaceId,
    workspaceName: message.channel.workspace.name,
  }));
  const recentNotes = recentNoteRows.map((note) => ({
    id: note.id,
    workspaceId: note.workspaceId,
    title: note.title,
    type: note.type,
    updatedAt: note.updatedAt,
    workspaceName: note.workspace?.name ?? "Workspace",
  }));
  const upcomingMeetings = upcomingMeetingRows.map((meeting) => ({
    id: meeting.id,
    workspaceId: meeting.workspaceId,
    title: meeting.title,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    canceledAt: meeting.canceledAt,
    workspaceName: meeting.workspace?.name ?? "Workspace",
  }));
  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-[#d8d8ce] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
              Scribbl
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[#171713]">
              Study Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#62645c]">
              Your course workspaces, saved notes, chats, and study sessions in one place.
            </p>
          </div>
          <div className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#777970]">
              {authUser ? "Signed in" : "Signed out"}
            </p>
            <p className="mt-1 text-lg font-semibold">{user?.displayName ?? "No user yet"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {authUser ? (
                <>
                  <Link
                    href="/account"
                    className="rounded-md border border-[#c8c8bd] bg-white px-3 py-1.5 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]"
                  >
                    Account
                  </Link>
                  <form action={signOut}>
                    <button className="rounded-md border border-[#c8c8bd] bg-white px-3 py-1.5 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-md border border-[#c8c8bd] bg-white px-3 py-1.5 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryTile label="Workspaces" value={workspaces.length} />
          <SummaryTile label="Recent Notes Shown" value={recentNotes.length} />
          <SummaryTile label="Upcoming Shown" value={upcomingMeetings.length} />
        </section>

        {pendingInvites.length > 0 ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Invitations</h2>
                <p className="mt-1 text-sm text-[#66685f]">
                  Workspaces waiting for you to join.
                </p>
              </div>
              <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
                {pendingInvites.length}
              </span>
            </div>
            <div className="mt-5 grid gap-3">
              {pendingInvites.map((invite) => (
                <article
                  key={invite.id}
                  className="flex flex-col gap-4 rounded-md border border-[#e2e2d8] bg-[#fbfbf8] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#6d7f70]">
                      {invite.role.toLowerCase()}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">{invite.workspace.name}</h3>
                    <p className="mt-2 text-sm text-[#66685f]">
                      Invited by {invite.invitedBy.displayName} / expires{" "}
                      {invite.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <form action={acceptWorkspaceInvite}>
                    <input type="hidden" name="token" value={invite.token} />
                    <button className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                      Accept
                    </button>
                  </form>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Workspaces</h2>
            </div>
            {currentUser ? (
              <form
                action={createWorkspace}
                className="mt-5 grid gap-3 rounded-md border border-[#e2e2d8] bg-[#fbfbf8] p-4"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Workspace name</span>
                    <input
                      name="name"
                      required
                      placeholder="BIO 101, Finals Study Group..."
                      className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Type</span>
                    <select
                      name="type"
                      defaultValue="STUDY_GROUP"
                      className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                    >
                      <option value="COURSE">Course</option>
                      <option value="STUDY_GROUP">Study group</option>
                      <option value="TUTORING_GROUP">Tutoring group</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-[#4d4f47]">Description</span>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="What will people use this workspace for?"
                    className="resize-y rounded-md border border-[#c8c8bd] bg-white p-3 text-sm leading-6 outline-none transition focus:border-[#2f604b]"
                  />
                </label>
                <div className="flex justify-end">
                  <button className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                    New Workspace
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-5 text-sm text-[#66685f]">
                Sign in to create and join workspaces.
              </div>
            )}
            <div className="mt-5 grid gap-4">
              {workspaces.length > 0 ? (
                workspaces.map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={`/workspaces/${workspace.id}`}
                    className="rounded-md border border-[#e2e2d8] bg-[#fbfbf8] p-4 transition hover:border-[#9ab09e] hover:bg-white"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#6d7f70]">
                          {workspace.type.replace("_", " ").toLowerCase()}
                        </p>
                        <h3 className="mt-1 text-lg font-semibold">{workspace.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-[#66685f]">
                          {workspace.description || "No description yet."}
                        </p>
                      </div>
                      <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
                        {workspace._count.channels} channel{workspace._count.channels === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                ))
              ) : (
                <EmptyState text="Create or accept a workspace invite to start using Scribbl." />
              )}
            </div>
          </div>

          <div className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            <div className="mt-5 grid gap-4">
              {upcomingMeetings.length > 0 ? (
                upcomingMeetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`}
                    className="block border-b border-[#e6e6dc] pb-4 transition hover:text-[#2f604b] last:border-0"
                  >
                    <p className="text-sm font-medium text-[#2f604b]">{meeting.workspaceName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{meeting.title}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${getMeetingBadgeClassName(getMeetingLifecycle(meeting, now))}`}>
                        {formatMeetingLifecycleLabel(getMeetingLifecycle(meeting, now))}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#66685f]">
                      {meeting.startsAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </Link>
                ))
              ) : (
                <EmptyState text="Upcoming sessions will appear here once they are scheduled." />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Recent Messages">
            {recentMessages.length > 0 ? (
              recentMessages.map((message) => (
                <Link
                  key={message.id}
                  href={`/workspaces/${message.workspaceId}/chat?channel=${message.channelId}`}
                  className="block rounded-md bg-white p-4 shadow-sm transition hover:bg-[#fbfbf8]"
                >
                  <p className="text-sm font-medium text-[#2f604b]">
                    {message.workspaceName} / #{message.channelName}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#4d4f47]">{message.body}</p>
                  <p className="mt-3 text-xs text-[#777970]">From {message.sender.displayName}</p>
                </Link>
              ))
            ) : (
              <EmptyState text="Recent workspace chat messages will appear here." />
            )}
          </Panel>

          <Panel title="Recent Notes">
            {recentNotes.length > 0 ? (
              recentNotes.map((note) => (
                <Link
                  key={note.id}
                  href={`/workspaces/${note.workspaceId}/notes/${note.id}`}
                  className="block rounded-md bg-white p-4 shadow-sm transition hover:bg-[#fbfbf8]"
                >
                  <p className="text-sm font-medium text-[#2f604b]">{note.workspaceName}</p>
                  <h3 className="mt-2 line-clamp-1 font-semibold">{note.title}</h3>
                  <p className="mt-3 text-xs text-[#777970]">
                    {note.type.toLowerCase()} note updated {note.updatedAt.toLocaleDateString()}
                  </p>
                </Link>
              ))
            ) : (
              <EmptyState text="Recent notes and whiteboards will appear here." />
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-[#686a62]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#c8c8bd] bg-white p-5 text-sm text-[#66685f]">
      {text}
    </div>
  );
}

function getMeetingBadgeClassName(state: MeetingLifecycleState) {
  switch (state) {
    case "live":
    case "joinable":
      return "bg-[#e7eee7] text-[#2f604b]";
    case "starting-soon":
      return "bg-[#fff3d8] text-[#7a5a1f]";
    default:
      return "bg-[#eeeee7] text-[#66685f]";
  }
}
