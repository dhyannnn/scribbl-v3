import Link from "next/link";
import { LocalDateTimeInput } from "@/components/LocalDateTimeInput";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  canJoinMeeting,
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
  type MeetingLifecycleState,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { scheduleMeeting } from "./actions";
import { ScheduleMeetingSubmitButton } from "./ScheduleMeetingSubmitButton";

type MeetingView = "upcoming" | "past" | "canceled" | "all";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meeting?: string; view?: string; groups?: string }>;
};

export default async function MeetingsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { meeting: meetingStatus, view, groups: groupsFilter } = await searchParams;
  const activeView = getMeetingView(view);
  const now = new Date();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      plan: true,
      members: {
        where: { status: "ACTIVE" },
        select: { userId: true, role: true },
      },
      groups: {
        select: {
          id: true,
          name: true,
          members: {
            where: { userId: currentUser.id },
            select: { userId: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      meetings: {
        select: {
          id: true,
          title: true,
          description: true,
          startsAt: true,
          endsAt: true,
          canceledAt: true,
          groupId: true,
          provider: true,
          recurrence: true,
          seriesId: true,
          participants: {
            where: { user: { deletedAt: null } },
            select: { id: true },
          },
          artifacts: {
            where: {
              OR: [
                { note: { deletedAt: null } },
                { fileId: { not: null } },
              ],
            },
            select: { id: true },
          },
        },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  if (!workspace) {
    notFound();
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

  const canManage = currentMembership.role === "OWNER" || currentMembership.role === "ADMIN";
  const isPro = workspace.plan !== "FREE";

  const myGroupIds = new Set(
    workspace.groups.filter((g) => g.members.length > 0).map((g) => g.id),
  );

  const filterToMyGroups = !canManage || groupsFilter === "mine";

  const visibleMeetings = workspace.meetings.filter((meeting) => {
    const lifecycle = getMeetingLifecycle(meeting, now);

    if (activeView === "canceled" && lifecycle !== "canceled") return false;
    if (activeView === "past" && lifecycle !== "ended") return false;
    if (activeView === "upcoming" && (lifecycle === "canceled" || lifecycle === "ended")) return false;

    if (filterToMyGroups && meeting.groupId !== null && !myGroupIds.has(meeting.groupId)) return false;

    return true;
  });

  const groupsForDropdown = isPro ? workspace.groups : [];
  const groupNameMap = new Map(workspace.groups.map((g) => [g.id, g.name]));

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <Link
            href={`/workspaces/${workspace.id}`}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
            Meetings
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            Schedule sessions, track artifacts, and review past calls.
          </p>
          {getMeetingStatusMessage(meetingStatus) ? (
            <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
              {getMeetingStatusMessage(meetingStatus)}
            </p>
          ) : null}
        </header>

        {/* Split layout */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

          {/* Left: Schedule form */}
          <aside className="w-full shrink-0 lg:w-[380px]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">
                Schedule a session
              </h2>
              <form action={scheduleMeeting} className="mt-5 flex flex-col gap-4">
                <input type="hidden" name="workspaceId" value={workspace.id} />

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Title</span>
                  <input
                    name="title"
                    required
                    placeholder="Team sync, project review..."
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Starts</span>
                  <LocalDateTimeInput className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]" />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Duration</span>
                  <select
                    name="durationMinutes"
                    defaultValue="60"
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                  >
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Description</span>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Agenda, prep notes, topics..."
                    className="resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm leading-6 outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                  />
                </label>

                {groupsForDropdown.length > 0 ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--color-muted)]">
                      Scope to group{" "}
                      <span className="font-normal text-[var(--color-subtle)]">(optional)</span>
                    </span>
                    <select
                      name="groupId"
                      defaultValue=""
                      className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                    >
                      <option value="">Whole workspace</option>
                      {groupsForDropdown.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {/* Recurrence */}
                <details className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">Repeat</span>
                    <span className="font-mono text-xs text-[var(--color-subtle)] group-open:hidden">Off</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="hidden text-[var(--color-subtle)] transition group-open:block group-open:rotate-180"><polyline points="6 9 12 15 18 9" /></svg>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-[var(--color-muted)]">Frequency</span>
                      <select
                        name="recurrence"
                        defaultValue=""
                        className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                      >
                        <option value="">No repeat</option>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="BIWEEKLY">Biweekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-[var(--color-muted)]">End date</span>
                      <input
                        name="recurrenceEndsAt"
                        type="date"
                        className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                      />
                    </label>
                    <p className="font-mono text-[10px] text-[var(--color-subtle)]">
                      Each instance gets its own hub, notes, and chat.
                    </p>
                  </div>
                </details>

                <ScheduleMeetingSubmitButton />
              </form>
            </div>
          </aside>

          {/* Right: Meeting list */}
          <div className="min-w-0 flex-1">

            {/* Tabs + group filter */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <nav className="flex flex-wrap gap-1.5">
                {([
                  ["upcoming", "Upcoming"],
                  ["past", "Past"],
                  ["canceled", "Canceled"],
                  ["all", "All"],
                ] as const).map(([value, label]) => (
                  <Link
                    key={value}
                    href={`/workspaces/${workspace.id}/meetings?view=${value}${filterToMyGroups && canManage ? "&groups=mine" : ""}`}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      activeView === value
                        ? "bg-[var(--color-primary)] text-white"
                        : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </nav>

              {canManage && isPro && workspace.groups.length > 0 ? (
                <Link
                  href={`/workspaces/${workspace.id}/meetings?view=${activeView}${filterToMyGroups ? "" : "&groups=mine"}`}
                  className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                >
                  {filterToMyGroups ? "Show all groups" : "My groups only"}
                </Link>
              ) : null}
            </div>

            {/* Meeting cards */}
            <div className="flex flex-col gap-3">
              {visibleMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  workspaceId={workspace.id}
                  meeting={meeting}
                  now={now}
                  groupName={meeting.groupId ? (groupNameMap.get(meeting.groupId) ?? null) : null}
                />
              ))}
              {visibleMeetings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
                  <p className="text-sm text-[var(--color-subtle)]">
                    No {activeView} sessions to show.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingCard({
  workspaceId,
  meeting,
  now,
  groupName,
}: {
  workspaceId: string;
  now: Date;
  groupName: string | null;
  meeting: {
    id: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date | null;
    canceledAt: Date | null;
    provider: string | null;
    recurrence: string | null;
    seriesId: string | null;
    participants: unknown[];
    artifacts: unknown[];
  };
}) {
  const lifecycle = getMeetingLifecycle(meeting, now);
  const actionLabel = getMeetingActionLabel(lifecycle);
  const isLive = lifecycle === "live" || lifecycle === "joinable";

  return (
    <Link
      href={`/workspaces/${workspaceId}/meetings/${meeting.id}`}
      className={`flex flex-col gap-4 rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
        isLive
          ? "border-[var(--color-secondary)] bg-[var(--color-surface-low)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-secondary)]"
      }`}
    >
      {/* Date + badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-[var(--color-subtle)]">
          <LocalTime date={meeting.startsAt} short />
        </span>
        <LifecycleBadge lifecycle={lifecycle} />
        {meeting.recurrence ? (
          <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-xs text-[var(--color-subtle)]">
            ↻ {meeting.recurrence.toLowerCase()}
          </span>
        ) : null}
        {groupName ? (
          <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
            {groupName}
          </span>
        ) : null}
      </div>

      {/* Title + description */}
      <div className="min-w-0">
        <h3 className="font-display text-base font-semibold text-[var(--color-text)] leading-snug">
          {meeting.title}
        </h3>
        {meeting.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">
            {meeting.description}
          </p>
        ) : null}
      </div>

      {/* Footer: stats + action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--color-subtle)]">
            {meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}
          </span>
          {meeting.artifacts.length > 0 ? (
            <span className="text-xs text-[var(--color-subtle)]">
              {meeting.artifacts.length} artifact{meeting.artifacts.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <span className={`rounded-full px-4 py-1 text-xs font-semibold ${
          isLive
            ? "bg-[var(--color-secondary)] text-white"
            : "border border-[var(--color-border)] text-[var(--color-muted)]"
        }`}>
          {actionLabel}
        </span>
      </div>
    </Link>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: MeetingLifecycleState }) {
  const { bg, text } = getMeetingBadgeTokens(lifecycle);
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${bg} ${text}`}>
      {formatMeetingLifecycleLabel(lifecycle)}
    </span>
  );
}

function getMeetingBadgeTokens(state: MeetingLifecycleState): { bg: string; text: string } {
  switch (state) {
    case "live":
      return { bg: "bg-[var(--color-danger-dim)]", text: "text-[var(--color-danger)]" };
    case "joinable":
    case "starting-soon":
      return { bg: "bg-[var(--color-warning-dim)]", text: "text-[var(--color-warning)]" };
    case "ended":
      return { bg: "bg-[var(--color-surface-high)]", text: "text-[var(--color-muted)]" };
    case "canceled":
      return { bg: "bg-[var(--color-danger-dim)]", text: "text-[var(--color-danger)]" };
    default:
      return { bg: "bg-[var(--color-secondary-dim)]", text: "text-[var(--color-secondary)]" };
  }
}

function getMeetingActionLabel(state: MeetingLifecycleState) {
  if (canJoinMeeting(state)) return "Join";
  if (state === "ended") return "Review";
  if (state === "canceled") return "Canceled";
  return "View";
}

function getMeetingStatusMessage(status?: string) {
  switch (status) {
    case "scheduled":
      return "Meeting scheduled.";
    case "scheduled-email-not-configured":
      return "Meeting scheduled. Add RESEND_API_KEY and EMAIL_FROM to send meeting emails.";
    case "scheduled-email-failed":
      return "Meeting scheduled, but the notification email could not be sent.";
    case "canceled":
      return "Meeting canceled.";
    case "canceled-email-not-configured":
      return "Meeting canceled. Add RESEND_API_KEY and EMAIL_FROM to send cancellation emails.";
    case "canceled-email-failed":
      return "Meeting canceled, but the cancellation email could not be sent.";
    case "invalid":
      return "Check the meeting details and try again.";
    case "unauthorized":
      return "You do not have permission to change that meeting.";
    case "read-only":
      return "This meeting is read-only now.";
    default:
      return null;
  }
}

function getMeetingView(value?: string): MeetingView {
  return value === "past" || value === "canceled" || value === "all" ? value : "upcoming";
}
