import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteAcceptedBroadcast } from "@/components/InviteAcceptedBroadcast";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
  canJoinMeeting,
  type MeetingLifecycleState,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/uuid";
import { updateWorkspaceDetails } from "./actions";

type WorkspacePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workspace?: string }>;
};

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const { id } = await params;
  const { workspace: workspaceStatus } = await searchParams;

  if (!isUuid(id)) notFound();

  const currentUser = await getCurrentUser();
  if (!currentUser) return <ProtectedPageMessage />;

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      plan: true,
      _count: {
        select: {
          members: { where: { status: "ACTIVE" } },
          notes: { where: { deletedAt: null, visibility: "WORKSPACE_SHARED" } },
          meetings: true,
        },
      },
      members: {
        where: { status: "ACTIVE" },
        select: { id: true, userId: true, role: true },
        orderBy: { createdAt: "asc" },
      },
      groups: {
        where: { members: { some: { userId: currentUser.id } } },
        select: { id: true },
      },
      notes: {
        where: { deletedAt: null, visibility: "WORKSPACE_SHARED" },
        select: { id: true, title: true, type: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
      },
      meetings: {
        where: {
          OR: [
            { groupId: null },
            { group: { members: { some: { userId: currentUser.id } } } },
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          startsAt: true,
          endsAt: true,
          canceledAt: true,
          groupId: true,
          participants: {
            where: { user: { deletedAt: null } },
            select: { id: true },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 20,
      },
      files: {
        where: { visibility: "WORKSPACE_SHARED" },
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedBy: { select: { displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 4,
      },
    },
  });

  if (!workspace) notFound();

  const currentMembership = workspace.members.find((m) => m.userId === currentUser.id);
  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const canManageWorkspace = currentMembership.role === "OWNER";
  const canManage = currentMembership.role === "OWNER" || currentMembership.role === "ADMIN";
  const now = new Date();

  const myGroupIds = new Set(workspace.groups.map((g) => g.id));
  const visibleMeetings = canManage
    ? workspace.meetings.slice(0, 5)
    : workspace.meetings.filter((m) => m.groupId === null || myGroupIds.has(m.groupId)).slice(0, 5);

  const liveMeeting = visibleMeetings.find((m) => {
    const lc = getMeetingLifecycle(m, now);
    return canJoinMeeting(lc);
  });

  const typeLabel = workspace.type.replace("_", " ").toLowerCase();

  const announcements = await prisma.message.findMany({
    where: {
      channel: { workspaceId: id, type: "ANNOUNCEMENT" },
      deletedAt: null,
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
      sender: { select: { displayName: true } },
      channel: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {workspaceStatus?.startsWith("invite-accepted") ? (
        <InviteAcceptedBroadcast href={`/workspaces/${workspace.id}`} />
      ) : null}

      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                  {typeLabel}
                </span>
                {workspace.plan !== "FREE" ? (
                  <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
                    {workspace.plan === "INSTITUTION" ? "Institution" : "Pro"}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-1 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
                {workspace.name}
              </h1>
              {workspace.description ? (
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
                  {workspace.description}
                </p>
              ) : null}
            </div>

            {/* Quick stats */}
            <div className="flex shrink-0 gap-3">
              {[
                { label: "Members", value: workspace._count.members, href: `/workspaces/${id}/members` },
                { label: "Notes", value: workspace._count.notes },
                { label: "Meetings", value: workspace._count.meetings },
              ].map((stat) =>
                stat.href ? (
                  <Link
                    key={stat.label}
                    href={stat.href}
                    className="flex min-w-[72px] flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center shadow-sm transition hover:border-[var(--color-secondary)]"
                  >
                    <span className="font-display text-2xl font-bold text-[var(--color-text)]">{stat.value}</span>
                    <span className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">{stat.label}</span>
                  </Link>
                ) : (
                  <div key={stat.label} className="flex min-w-[72px] flex-col items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-center shadow-sm">
                    <span className="font-display text-2xl font-bold text-[var(--color-text)]">{stat.value}</span>
                    <span className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">{stat.label}</span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Status messages */}
          {getWorkspaceStatusMessage(workspaceStatus) ? (
            <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
              {getWorkspaceStatusMessage(workspaceStatus)}
            </p>
          ) : null}
        </header>

        {/* Live meeting banner */}
        {liveMeeting ? (
          <Link
            href={`/workspaces/${id}/meetings/${liveMeeting.id}`}
            className="mb-8 flex items-center justify-between gap-4 rounded-2xl bg-[var(--color-live)] px-6 py-4 text-white transition hover:opacity-95"
          >
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-red-400">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                Live session
              </span>
              <span className="font-semibold">{liveMeeting.title}</span>
            </div>
            <span className="rounded-full bg-[var(--color-secondary)] px-4 py-1.5 text-sm font-semibold">
              Join now
            </span>
          </Link>
        ) : null}

        {/* Workspace settings (owners only) */}
        {canManageWorkspace ? (
          <details className="group mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4">
              <span className="font-display text-base font-semibold text-[var(--color-text)]">Workspace Settings</span>
              <div className="flex items-center gap-2">
                {workspace.plan === "INSTITUTION" ? (
                  <Link
                    href={`/workspaces/${id}/audit-log`}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                  >
                    Audit Log
                  </Link>
                ) : null}
                <Link
                  href={`/workspaces/${id}/billing`}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                >
                  Billing
                </Link>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-subtle)] transition group-open:rotate-180">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </summary>
            <div className="border-t border-[var(--color-border)] px-6 py-5">
              <form action={updateWorkspaceDetails} className="grid gap-4 lg:grid-cols-[1fr_200px_auto]">
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Name</span>
                  <input
                    name="name"
                    required
                    defaultValue={workspace.name}
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Type</span>
                  <select
                    name="type"
                    defaultValue={workspace.type}
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                  >
                    <option value="TEAM">Team</option>
                    <option value="PROJECT">Project</option>
                    <option value="CLASS">Class</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <PendingSubmitButton
                    pendingLabel="Saving..."
                    className="min-h-10 w-full rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
                  >
                    Save
                  </PendingSubmitButton>
                </div>
                <label className="flex flex-col gap-1.5 lg:col-span-3">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Description</span>
                  <textarea
                    name="description"
                    rows={2}
                    defaultValue={workspace.description ?? ""}
                    className="resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                  />
                </label>
              </form>
            </div>
          </details>
        ) : null}

        {/* Announcements */}
        {announcements.length > 0 ? (
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                  <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                </svg>
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                  Announcements
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-[var(--color-secondary-dim)] bg-[var(--color-secondary-dim)] px-5 py-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[var(--color-secondary)]">
                      {a.sender.displayName}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-subtle)]">
                      {a.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--color-text)] leading-relaxed line-clamp-3">
                    {a.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Main content grid */}
        <div className="grid gap-8 lg:grid-cols-2">

          {/* Recent meetings */}
          <section>
            <SectionHeader title="Meetings" href={`/workspaces/${id}/meetings`} action="View all" />
            <div className="mt-4 flex flex-col gap-3">
              {visibleMeetings.length > 0 ? visibleMeetings.map((meeting) => {
                const lifecycle = getMeetingLifecycle(meeting, now);
                const joinable = canJoinMeeting(lifecycle);
                return (
                  <Link
                    key={meeting.id}
                    href={`/workspaces/${id}/meetings/${meeting.id}`}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition hover:border-[var(--color-secondary)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${getMeetingBadgeClass(lifecycle)}`}>
                          {formatMeetingLifecycleLabel(lifecycle)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate font-semibold text-[var(--color-text)]">{meeting.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {meeting.startsAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                      joinable
                        ? "bg-[var(--color-secondary)] text-white"
                        : "border border-[var(--color-border)] text-[var(--color-muted)]"
                    }`}>
                      {getMeetingActionLabel(lifecycle)}
                    </span>
                  </Link>
                );
              }) : (
                <EmptyCard text="No upcoming meetings." href={`/workspaces/${id}/meetings`} linkText="Schedule one" />
              )}
            </div>
          </section>

          {/* Recent notes */}
          <section>
            <SectionHeader title="Notes" href={`/workspaces/${id}/notes`} action="View all" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {workspace.notes.length > 0 ? workspace.notes.map((note) => (
                <Link
                  key={note.id}
                  href={`/workspaces/${id}/notes/${note.id}`}
                  className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition hover:border-[var(--color-secondary)]"
                >
                  <div className="flex items-center gap-2">
                    {note.type === "WHITEBOARD" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                        <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    )}
                    <span className="font-mono text-xs text-[var(--color-subtle)]">{note.type.toLowerCase()}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold text-[var(--color-text)]">{note.title}</p>
                  <p className="mt-auto pt-3 text-xs text-[var(--color-subtle)]">
                    {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </Link>
              )) : (
                <div className="col-span-2">
                  <EmptyCard text="No shared notes yet." href={`/workspaces/${id}/notes`} linkText="Create a note" />
                </div>
              )}
            </div>
          </section>

          {/* Recent files */}
          <section className="lg:col-span-2">
            <SectionHeader title="Files" href={`/workspaces/${id}/files`} action="View all" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {workspace.files.length > 0 ? workspace.files.map((file) => (
                <a
                  key={file.id}
                  href={`/api/files/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition hover:border-[var(--color-secondary)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface-low)]">
                    <FileIcon mimeType={file.mimeType} />
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-[var(--color-text)]">{file.name}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {file.uploadedBy.displayName}
                  </p>
                  {file.sizeBytes ? (
                    <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">{formatFileSize(file.sizeBytes)}</p>
                  ) : null}
                </a>
              )) : (
                <div className="col-span-4">
                  <EmptyCard text="No files uploaded yet." href={`/workspaces/${id}/files`} linkText="Upload a file" />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <Link href={href} className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
        {action} →
      </Link>
    </div>
  );
}

function EmptyCard({ text, href, linkText }: { text: string; href: string; linkText: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
      <p className="text-sm text-[var(--color-muted)]">{text}</p>
      <Link href={href} className="mt-2 inline-block text-sm font-medium text-[var(--color-secondary)] hover:underline">
        {linkText} →
      </Link>
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  const cls = "text-[var(--color-secondary)]";
  if (mimeType === "application/pdf") {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
  }
  if (mimeType.startsWith("video/")) {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
  }
  if (mimeType.startsWith("image/")) {
    return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  }
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
}

function getMeetingActionLabel(state: MeetingLifecycleState) {
  if (canJoinMeeting(state)) return "Join";
  if (state === "ended") return "Review";
  if (state === "canceled") return "Canceled";
  return "View";
}

function getMeetingBadgeClass(state: MeetingLifecycleState) {
  switch (state) {
    case "live":
    case "joinable":
      return "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]";
    case "starting-soon":
      return "bg-[var(--color-warning-dim)] text-[var(--color-warning)]";
    case "ended":
      return "bg-[var(--color-surface-high)] text-[var(--color-muted)]";
    case "canceled":
      return "bg-[var(--color-danger-dim)] text-[var(--color-danger)]";
    default:
      return "bg-[var(--color-surface-mid)] text-[var(--color-muted)]";
  }
}

function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${i === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[i]}`;
}

function getWorkspaceStatusMessage(status?: string) {
  switch (status) {
    case "updated": return "Workspace settings updated.";
    case "invite-accepted": return "Invite accepted.";
    case "invite-accepted-email-not-configured": return "Invite accepted. Add RESEND_API_KEY to notify owners.";
    case "invite-accepted-email-failed": return "Invite accepted, but owners could not be notified.";
    default: return null;
  }
}
