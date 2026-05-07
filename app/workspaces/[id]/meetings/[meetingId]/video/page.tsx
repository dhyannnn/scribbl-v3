import { notFound } from "next/navigation";
import { MeetingRouteRefresher } from "@/components/MeetingRouteRefresher";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  canJoinMeeting,
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { VideoPopoutShell } from "./VideoPopoutShell";

type PageProps = {
  params: Promise<{
    id: string;
    meetingId: string;
  }>;
  searchParams: Promise<{
    recording?: string;
  }>;
};

const activeRecordingStatuses = ["STARTING", "ACTIVE", "STOPPING"] as const;

export default async function MeetingVideoPage({ params, searchParams }: PageProps) {
  const { id, meetingId } = await params;
  const { recording: recordingStatus } = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      workspaceId: id,
    },
    include: {
      workspace: {
        include: {
          members: {
            where: {
              status: "ACTIVE",
            },
            select: {
              userId: true,
              role: true,
            },
          },
        },
      },
      recordings: {
        include: {
          startedBy: {
            select: {
              displayName: true,
            },
          },
          stoppedBy: {
            select: {
              displayName: true,
            },
          },
          file: {
            select: {
              id: true,
              name: true,
              sizeBytes: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!meeting || !meeting.workspace) {
    notFound();
  }

  const currentMembership = meeting.workspace.members.find((member) => member.userId === currentUser.id);

  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const lifecycle = getMeetingLifecycle(meeting);
  const isVideoOpen = canJoinMeeting(lifecycle);
  const activeRecording = meeting.recordings.find((recording) =>
    activeRecordingStatuses.includes(recording.status as (typeof activeRecordingStatuses)[number]),
  );
  const latestRecording = activeRecording ?? meeting.recordings[0];
  const canManageRecording =
    meeting.createdByUserId === currentUser.id ||
    currentMembership.role === "OWNER" ||
    currentMembership.role === "ADMIN";

  return (
    <>
      <MeetingRouteRefresher />
      <VideoPopoutShell
        workspaceId={id}
        meetingId={meeting.id}
        meetingTitle={meeting.title}
        workspaceName={meeting.workspace.name}
        lifecycleLabel={formatMeetingLifecycleLabel(lifecycle)}
        hubHref={`/workspaces/${id}/meetings/${meeting.id}`}
        disabled={!isVideoOpen}
        recordingStatusMessage={getRecordingStatusMessage(recordingStatus)}
        recording={{
          activeRecording,
          canManage: canManageRecording,
          latestRecording,
        }}
      />
    </>
  );
}

function getRecordingStatusMessage(status?: string) {
  switch (status) {
    case "started":
      return "Recording started.";
    case "stopped":
      return "Recording stopped. The file may need a moment to finish processing.";
    case "already-active":
      return "This meeting is already being recorded.";
    case "already-complete":
      return "This recording is already complete.";
    case "not-open":
      return "Recording is available only while the meeting video room is open.";
    case "no-video-participants":
      return "Recording starts after you have joined video.";
    case "unauthorized":
      return "You do not have permission to manage recordings.";
    case "start-failed":
      return "Recording could not be started. Check LiveKit and recording storage settings.";
    case "stop-failed":
      return "Recording could not be stopped.";
    default:
      return null;
  }
}
