import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
  type MeetingLifecycleState,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceDetails } from "./actions";

type WorkspacePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    workspace?: string;
  }>;
};

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { id } = await params;
  const { workspace: workspaceStatus } = await searchParams;
  const currentUser = await getCurrentUser();

  const workspace = await prisma.workspace.findUnique({
    where: {
      id,
    },
    include: {
      members: {
        where: {
          status: "ACTIVE",
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
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
        orderBy: {
          createdAt: "asc",
        },
      },
      notes: {
        where: {
          deletedAt: null,
          visibility: "WORKSPACE_SHARED",
        },
        orderBy: {
          updatedAt: "desc",
        },
      },
      meetings: {
        include: {
          participants: {
            include: {
              user: true,
            },
          },
          artifacts: {
            where: {
              OR: [
                {
                  note: {
                    deletedAt: null,
                  },
                },
                {
                  fileId: {
                    not: null,
                  },
                },
              ],
            },
            include: {
              note: true,
              file: true,
            },
          },
        },
        orderBy: {
          startsAt: "asc",
        },
      },
      files: {
        where: {
          visibility: "WORKSPACE_SHARED",
        },
        include: {
          uploadedBy: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!workspace) {
    notFound();
  }

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const currentMembership = workspace.members.find((member) => member.userId === currentUser.id);

  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const primaryChannel = workspace.channels[0];
  const primaryChannelMessages = primaryChannel ? [...primaryChannel.messages].reverse() : [];
  const canManageWorkspace = currentMembership.role === "OWNER";

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={"/"} className="text-sm font-medium text-[#2f604b]">
            Back to dashboard
          </Link>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                {workspace.type.replace("_", " ").toLowerCase()}
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[#171713]">
                {workspace.name}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#62645c]">
                {workspace.description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
              <MiniMetric
                label="Members"
                value={workspace.members.length}
                href={`/workspaces/${workspace.id}/members`}
              />
              <MiniMetric label="Notes" value={workspace.notes.length} />
              <MiniMetric label="Meetings" value={workspace.meetings.length} />
            </div>
          </div>
        </header>

        {getWorkspaceStatusMessage(workspaceStatus) ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
            {getWorkspaceStatusMessage(workspaceStatus)}
          </p>
        ) : null}

        {canManageWorkspace ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Workspace Settings</h2>
            <form action={updateWorkspaceDetails} className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_auto]">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Name</span>
                <input
                  name="name"
                  required
                  defaultValue={workspace.name}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Type</span>
                <select
                  name="type"
                  defaultValue={workspace.type}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                >
                  <option value="COURSE">Course</option>
                  <option value="STUDY_GROUP">Study group</option>
                  <option value="TUTORING_GROUP">Tutoring group</option>
                </select>
              </label>
              <div className="flex items-end">
                <button className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                  Save
                </button>
              </div>
              <label className="grid gap-2 lg:col-span-3">
                <span className="text-sm font-medium text-[#4d4f47]">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={workspace.description ?? ""}
                  className="resize-y rounded-md border border-[#c8c8bd] bg-[#fbfbf8] p-3 text-sm leading-6 outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
            </form>
          </section>
        ) : null}

        <nav className="grid gap-3 sm:grid-cols-4">
          {[
            ["Chat", `/workspaces/${workspace.id}/chat`],
            ["Notes", `/workspaces/${workspace.id}/notes`],
            ["Meetings", `/workspaces/${workspace.id}/meetings`],
            ["Files", `/workspaces/${workspace.id}/files`],
          ].map(([item, href]) => (
            <Link
              key={item}
              href={href}
              className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-center text-sm font-medium text-[#2f604b] shadow-sm"
            >
              {item}
            </Link>
          ))}
        </nav>

        <section>
          <div id="chat" className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 border-b border-[#e6e6dc] pb-4">
              <p className="text-sm font-medium text-[#2f604b]">#{primaryChannel?.name ?? "general"}</p>
              <h2 className="text-xl font-semibold">Course Chat</h2>
            </div>
            <div className="mt-5 grid gap-4">
              {primaryChannelMessages.map((message) => (
                <article key={message.id} className="rounded-md bg-[#fbfbf8] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">{message.sender.displayName}</p>
                    <p className="text-xs text-[#777970]">
                      {message.createdAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#4d4f47]">{message.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="notes">
          <SectionHeader
            title="Workspace Notes"
            action="Open Notes"
            href={`/workspaces/${workspace.id}/notes`}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {workspace.notes.map((note) => (
              <article key={note.id} className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-[#2f604b]">{note.type.toLowerCase()}</p>
                <h3 className="mt-2 text-lg font-semibold">{note.title}</h3>
                <p className="mt-3 text-sm text-[#66685f]">
                  Updated {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="meetings">
          <SectionHeader
            title="Meetings"
            action="Open Meetings"
            href={`/workspaces/${workspace.id}/meetings`}
          />
          <div className="mt-4 grid gap-4">
            {workspace.meetings.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/workspaces/${workspace.id}/meetings/${meeting.id}`}
                className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#2f604b]">
                      {meeting.startsAt.toLocaleString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">{meeting.title}</h3>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${getMeetingBadgeClassName(getMeetingLifecycle(meeting))}`}>
                        {formatMeetingLifecycleLabel(getMeetingLifecycle(meeting))}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#66685f]">{meeting.description}</p>
                  </div>
                  <div className="grid gap-2 rounded-md bg-[#fbfbf8] px-4 py-3 text-sm text-[#4d4f47]">
                    <span>
                      {meeting.participants.length} participant
                      {meeting.artifacts.length > 0 ? ` / ${meeting.artifacts.length} saved artifact` : ""}
                    </span>
                    <span className="font-medium text-[#2f604b]">
                      {getMeetingActionLabel(getMeetingLifecycle(meeting))}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="files">
          <SectionHeader
            title="Workspace Files"
            action="Open Files"
            href={`/workspaces/${workspace.id}/files`}
          />
          {workspace.files.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {workspace.files.map((file) => (
                <article key={file.id} className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#2f604b]">{formatFileType(file.mimeType)}</p>
                      <h3 className="mt-2 text-lg font-semibold">{file.name}</h3>
                      <p className="mt-3 text-sm text-[#66685f]">
                        Uploaded by {file.uploadedBy.displayName} on{" "}
                        {file.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                      <p className="mt-1 text-xs text-[#777970]">{formatFileSize(file.sizeBytes)}</p>
                    </div>
                    <Link
                      href={`/api/files/${file.id}`}
                      target="_blank"
                      className="rounded-md bg-[#2f604b] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[#244b3a]"
                    >
                      Open
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-dashed border-[#c8c8bd] bg-white p-8 text-center text-sm text-[#66685f]">
              Workspace-shared uploads, PDFs, and meeting recordings will show up here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MiniMetric({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <>
      <p className="text-xs font-medium text-[#686a62]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-md border border-[#d8d8ce] bg-white p-3 text-center shadow-sm transition hover:border-[#9ab09e] hover:bg-[#fbfbf8]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-[#d8d8ce] bg-white p-3 text-center shadow-sm">
      {content}
    </div>
  );
}

function SectionHeader({ title, action, href }: { title: string; action: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Link href={href} className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white">
        {action}
      </Link>
    </div>
  );
}

function getWorkspaceStatusMessage(status?: string) {
  switch (status) {
    case "updated":
      return "Workspace settings updated.";
    case "invite-accepted":
      return "Invite accepted. Workspace owners were notified.";
    case "invite-accepted-email-not-configured":
      return "Invite accepted. Add RESEND_API_KEY and EMAIL_FROM to notify workspace owners.";
    case "invite-accepted-email-failed":
      return "Invite accepted, but workspace owners could not be notified by email.";
    default:
      return null;
  }
}

function formatFileType(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "PDF";
  }

  if (mimeType.startsWith("image/")) {
    return `${mimeType.replace("image/", "").toUpperCase()} image`;
  }

  if (mimeType.startsWith("video/")) {
    return `${mimeType.replace("video/", "").toUpperCase()} video`;
  }

  if (mimeType === "text/plain") {
    return "Text file";
  }

  return mimeType || "File";
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) {
    return "Size unknown";
  }

  const units = ["bytes", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function getMeetingActionLabel(state: MeetingLifecycleState) {
  switch (state) {
    case "joinable":
    case "live":
      return "Join";
    case "ended":
      return "Review";
    case "canceled":
      return "Canceled";
    default:
      return "View";
  }
}

function getMeetingBadgeClassName(state: MeetingLifecycleState) {
  switch (state) {
    case "live":
    case "joinable":
      return "bg-[#e7eee7] text-[#2f604b]";
    case "starting-soon":
      return "bg-[#fff3d8] text-[#7a5a1f]";
    case "ended":
      return "bg-[#eeeee7] text-[#66685f]";
    case "canceled":
      return "bg-[#fff7f5] text-[#7a3434]";
    default:
      return "bg-[#f0f0ea] text-[#66685f]";
  }
}
