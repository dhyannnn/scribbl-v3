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
};

export default async function MeetingVideoPage({ params }: PageProps) {
  const { id, meetingId } = await params;
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
            },
          },
        },
      },
    },
  });

  if (!meeting || !meeting.workspace) {
    notFound();
  }

  if (!meeting.workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const lifecycle = getMeetingLifecycle(meeting);
  const isVideoOpen = canJoinMeeting(lifecycle);

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
      />
    </>
  );
}
