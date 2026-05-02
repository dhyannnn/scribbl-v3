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

export default async function Home() {
  const [currentUser, authUser] = await Promise.all([getCurrentUser(), getSupabaseAuthUser()]);
  const now = new Date();
  const fallbackLiveStartsAt = new Date(now.getTime() - 60 * 60 * 1000);

  const user = currentUser
    ? await prisma.user.findUnique({
        where: {
          id: currentUser.id,
        },
        include: {
          memberships: {
            where: {
              status: "ACTIVE",
            },
            include: {
              workspace: {
                include: {
                  channels: {
                    include: {
                      messages: {
                        where: {
                          deletedAt: null,
                        },
                        include: {
                          sender: true,
                        },
                        orderBy: {
                          createdAt: "desc",
                        },
                        take: 3,
                      },
                    },
                  },
                  notes: {
                    where: {
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
                    orderBy: {
                      updatedAt: "desc",
                    },
                    take: 3,
                  },
                  meetings: {
                    where: {
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
                    orderBy: {
                      startsAt: "asc",
                    },
                    take: 8,
                  },
                },
              },
            },
          },
        },
      })
    : null;

  const workspaces = user?.memberships.map((membership) => membership.workspace) ?? [];
  const pendingInvites = currentUser
    ? await prisma.workspaceInvite.findMany({
        where: {
          email: currentUser.email,
          status: "PENDING",
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          workspace: true,
          invitedBy: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    : [];
  const recentMessages = workspaces.flatMap((workspace) =>
    workspace.channels.flatMap((channel) =>
      channel.messages.map((message) => ({
        ...message,
        channelName: channel.name,
        workspaceName: workspace.name,
      })),
    ),
  );
  const recentNotes = workspaces.flatMap((workspace) =>
    workspace.notes.map((note) => ({
      ...note,
      workspaceName: workspace.name,
    })),
  );
  const upcomingMeetings = workspaces.flatMap((workspace) =>
    workspace.meetings.map((meeting) => ({
      ...meeting,
      workspaceName: workspace.name,
    })),
  )
    .filter((meeting) => {
      const lifecycle = getMeetingLifecycle(meeting, now);
      return lifecycle !== "canceled" && lifecycle !== "ended";
    })
    .sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime())
    .slice(0, 3);

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
                <form action={signOut}>
                  <button className="rounded-md border border-[#c8c8bd] bg-white px-3 py-1.5 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                    Sign out
                  </button>
                </form>
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
          <SummaryTile label="Recent Notes" value={recentNotes.length} />
          <SummaryTile label="Upcoming Meetings" value={upcomingMeetings.length} />
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
              {workspaces.map((workspace) => (
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
                        {workspace.description}
                      </p>
                    </div>
                    <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
                      {workspace.channels.length} channel
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            <div className="mt-5 grid gap-4">
              {upcomingMeetings.map((meeting) => (
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
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Panel title="Recent Messages">
            {recentMessages.map((message) => (
              <article key={message.id} className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-[#2f604b]">
                  {message.workspaceName} / #{message.channelName}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#4d4f47]">{message.body}</p>
                <p className="mt-3 text-xs text-[#777970]">From {message.sender.displayName}</p>
              </article>
            ))}
          </Panel>

          <Panel title="Recent Notes">
            {recentNotes.map((note) => (
              <article key={note.id} className="rounded-md bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-[#2f604b]">{note.workspaceName}</p>
                <h3 className="mt-2 font-semibold">{note.title}</h3>
                <p className="mt-3 text-xs text-[#777970]">
                  {note.type.toLowerCase()} note updated {note.updatedAt.toLocaleDateString()}
                </p>
              </article>
            ))}
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

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="grid gap-4">{children}</div>
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
