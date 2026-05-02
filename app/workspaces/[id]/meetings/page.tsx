import Link from "next/link";
import { notFound } from "next/navigation";
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

type MeetingView = "upcoming" | "past" | "canceled" | "all";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ meeting?: string; view?: string }>;
};

export default async function MeetingsPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { meeting: meetingStatus, view } = await searchParams;
  const activeView = getMeetingView(view);
  const now = new Date();
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      members: {
        where: {
          status: "ACTIVE",
        },
        select: {
          userId: true,
        },
      },
      meetings: {
        include: {
          participants: { include: { user: true } },
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
            include: { note: true, file: true },
          },
        },
        orderBy: { startsAt: "asc" },
      },
    },
  });

  if (!workspace) {
    notFound();
  }

  if (!workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const visibleMeetings = workspace.meetings.filter((meeting) => {
    const lifecycle = getMeetingLifecycle(meeting, now);

    if (activeView === "all") {
      return true;
    }

    if (activeView === "canceled") {
      return lifecycle === "canceled";
    }

    return activeView === "past" ? lifecycle === "ended" : lifecycle !== "canceled" && lifecycle !== "ended";
  });

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d8d8ce] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
              Back to {workspace.name}
            </Link>
            <h1 className="mt-4 text-4xl font-semibold">Meetings</h1>
            <p className="mt-3 text-base leading-7 text-[#62645c]">
              Scheduled tutoring sessions, online classes, and saved call artifacts.
            </p>
          </div>
        </header>

        {getMeetingStatusMessage(meetingStatus) ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
            {getMeetingStatusMessage(meetingStatus)}
          </p>
        ) : null}

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Schedule a Session</h2>
          <form action={scheduleMeeting} className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_160px_auto]">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Title</span>
              <input
                name="title"
                required
                placeholder="Chapter review, tutoring session, online class..."
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Starts</span>
              <input
                name="startsAt"
                type="datetime-local"
                required
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Duration</span>
              <select
                name="durationMinutes"
                defaultValue="60"
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
              >
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
              </select>
            </label>
            <div className="flex items-end">
              <button className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                Schedule
              </button>
            </div>
            <label className="grid gap-2 lg:col-span-4">
              <span className="text-sm font-medium text-[#4d4f47]">Description</span>
              <textarea
                name="description"
                rows={3}
                placeholder="Add the purpose, prep notes, or topics for this session."
                className="resize-y rounded-md border border-[#c8c8bd] bg-[#fbfbf8] p-3 text-sm leading-6 outline-none transition focus:border-[#2f604b] focus:bg-white"
              />
            </label>
          </form>
        </section>

        <nav className="flex flex-wrap gap-2">
          {[
            ["upcoming", "Upcoming"],
            ["past", "Past"],
            ["canceled", "Canceled"],
            ["all", "All"],
          ].map(([value, label]) => (
            <Link
              key={value}
              href={`/workspaces/${workspace.id}/meetings?view=${value}`}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeView === value
                  ? "bg-[#2f604b] text-white"
                  : "border border-[#c8c8bd] bg-white text-[#2f604b] hover:bg-[#eef5ef]"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <section className="grid gap-4">
          {visibleMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} workspaceId={workspace.id} meeting={meeting} now={now} />
          ))}
          {visibleMeetings.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#c8c8bd] bg-white p-8 text-center text-sm text-[#66685f]">
              No {activeView} meetings to show.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function MeetingCard({
  workspaceId,
  meeting,
  now,
}: {
  workspaceId: string;
  now: Date;
  meeting: {
    id: string;
    title: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date | null;
    canceledAt: Date | null;
    provider: string | null;
    participants: unknown[];
    artifacts: unknown[];
  };
}) {
  const lifecycle = getMeetingLifecycle(meeting, now);
  const actionLabel = getMeetingActionLabel(lifecycle);

  return (
    <Link
      href={`/workspaces/${workspaceId}/meetings/${meeting.id}`}
      className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm transition hover:border-[#9ab09e]"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
                  <p className="text-sm font-medium text-[#2f604b]">
                    {meeting.startsAt.toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{meeting.title}</h2>
                  <span className={`mt-2 inline-flex rounded-md px-3 py-1 text-xs font-medium ${getMeetingBadgeClassName(lifecycle)}`}>
                    {formatMeetingLifecycleLabel(lifecycle)}
                  </span>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66685f]">{meeting.description}</p>
                </div>
                <div className="grid gap-2 rounded-md bg-[#fbfbf8] p-4 text-sm text-[#4d4f47] sm:min-w-[260px]">
                  <p>{meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}</p>
                  <p>{meeting.artifacts.length} saved artifact{meeting.artifacts.length === 1 ? "" : "s"}</p>
                  <p>{meeting.provider ?? "No provider yet"}</p>
                  <span className="mt-2 inline-flex justify-center rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white">
                    {actionLabel}
                  </span>
                </div>
              </div>
            </Link>
  );
}

function getMeetingActionLabel(state: MeetingLifecycleState) {
  if (canJoinMeeting(state)) {
    return "Join";
  }

  if (state === "ended") {
    return "Review";
  }

  if (state === "canceled") {
    return "Canceled";
  }

  return "View";
}

function getMeetingBadgeClassName(state: MeetingLifecycleState) {
  switch (state) {
    case "live":
      return "bg-[#e7eee7] text-[#2f604b]";
    case "joinable":
    case "starting-soon":
      return "bg-[#fff7dc] text-[#69510f]";
    case "ended":
      return "bg-[#ecece4] text-[#4d4f47]";
    case "canceled":
      return "bg-[#fff0ed] text-[#7a3434]";
    default:
      return "bg-[#eef3f8] text-[#2f4f66]";
  }
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
