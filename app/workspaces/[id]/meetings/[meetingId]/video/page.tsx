import { notFound } from "next/navigation";
import { MeetingRouteRefresher } from "@/components/MeetingRouteRefresher";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  canJoinMeeting,
  formatMeetingLifecycleLabel,
  getMeetingLifecycle,
} from "@/lib/meeting-lifecycle";
import { createChatRoomId } from "@/lib/liveblocks-room";
import {
  canCreateMeetingPoll,
  canManageMeetingParticipantPermissions,
  canModerateMeeting,
  getMeetingVideoPermissions,
  type MeetingPermissionOverrideInput,
} from "@/lib/meeting-permissions";
import { shapePoll } from "@/lib/polls";
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
      pendingCall: {
        select: { id: true, callerId: true, calleeId: true, expiresAt: true },
      },
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
      artifacts: {
        where: {
          OR: [
            {
              note: {
                deletedAt: null,
                visibility: "WORKSPACE_SHARED",
              },
            },
            {
              file: {
                visibility: "WORKSPACE_SHARED",
              },
            },
          ],
        },
        select: {
          id: true,
          type: true,
          source: true,
          createdAt: true,
          note: {
            select: {
              title: true,
              type: true,
              updatedAt: true,
              owner: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          file: {
            select: {
              id: true,
              name: true,
              sizeBytes: true,
              uploadedBy: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 8,
      },
      moderationSettings: true,
      channel: {
        select: {
          id: true,
          name: true,
          messages: {
            select: {
              id: true, channelId: true, senderUserId: true, body: true,
              createdAt: true, editedAt: true, deletedAt: true,
              isPinned: true, replyToId: true,
              sender: { select: { displayName: true, avatarUrl: true } },
              replyTo: { select: { id: true, body: true, sender: { select: { displayName: true } } } },
              reactions: { select: { emoji: true, userId: true } },
              attachmentFile: { select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      },
      seriesChannel: {
        select: {
          id: true,
          name: true,
          messages: {
            select: {
              id: true, channelId: true, senderUserId: true, body: true,
              createdAt: true, editedAt: true, deletedAt: true,
              isPinned: true, replyToId: true,
              sender: { select: { displayName: true, avatarUrl: true } },
              replyTo: { select: { id: true, body: true, sender: { select: { displayName: true } } } },
              reactions: { select: { emoji: true, userId: true } },
              attachmentFile: { select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          },
        },
      },
      permissionOverrides: {
        select: {
          id: true,
          userId: true,
          targetType: true,
          artifactId: true,
          state: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
          artifact: {
            select: {
              note: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
      participants: {
        where: {
          user: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          handRaisedAt: true,
          handLoweredAt: true,
          user: {
            select: {
              displayName: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
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
  const currentParticipant = meeting.participants.find((participant) => participant.userId === currentUser.id);
  const handRaised =
    !!currentParticipant?.handRaisedAt &&
    (!currentParticipant.handLoweredAt ||
      currentParticipant.handLoweredAt < currentParticipant.handRaisedAt);
  const permissions = {
    ...getMeetingVideoPermissions({
      currentUserId: currentUser.id,
      meetingCreatedByUserId: meeting.createdByUserId,
      currentUserRole: currentMembership.role,
      settings: meeting.moderationSettings,
      overrides: meeting.permissionOverrides as MeetingPermissionOverrideInput[],
    }),
    handRaised,
  };
  const canModerate = canModerateMeeting({
    currentUserId: currentUser.id,
    meetingCreatedByUserId: meeting.createdByUserId,
    currentUserRole: currentMembership.role,
  });
  const canModerateChat = currentMembership.role === "OWNER" || currentMembership.role === "ADMIN";
  const pollPermissionContext = {
    currentUserId: currentUser.id,
    meetingCreatedByUserId: meeting.createdByUserId,
    currentUserRole: currentMembership.role,
    settings: meeting.moderationSettings,
    overrides: meeting.permissionOverrides as MeetingPermissionOverrideInput[],
  };
  const canCreatePoll = canCreateMeetingPoll(pollPermissionContext);
  const rawPolls = await prisma.poll.findMany({
    where: { meetingId },
    select: {
      id: true, question: true, options: true, createdByUserId: true,
      closedAt: true, createdAt: true, updatedAt: true,
      createdBy: { select: { displayName: true } },
      votes: { select: { userId: true, optionIndex: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const initialPolls = rawPolls.map((p) => shapePoll(p, currentUser.id));
  const pendingRequests = meeting.permissionOverrides.filter(
    (override) =>
      override.state === "REQUESTED" &&
      canManageMeetingParticipantPermissions({
        currentUserId: currentUser.id,
        meetingCreatedByUserId: meeting.createdByUserId,
        currentUserRole: currentMembership.role,
        targetUserId: override.userId,
        targetUserRole: meeting.workspace?.members.find((member) => member.userId === override.userId)?.role,
      }),
  );
  const rawChannel = meeting.channel ?? meeting.seriesChannel;
  const meetingChannel = rawChannel
    ? {
        id: rawChannel.id,
        name: rawChannel.name,
        messages: [...rawChannel.messages].reverse().map((message) => {
          const reactionMap = new Map<string, string[]>();
          for (const r of message.reactions) {
            const arr = reactionMap.get(r.emoji) ?? [];
            arr.push(r.userId);
            reactionMap.set(r.emoji, arr);
          }
          return {
            id: message.id, channelId: message.channelId, senderUserId: message.senderUserId,
            body: message.body, createdAt: message.createdAt.toISOString(),
            editedAt: message.editedAt?.toISOString() ?? null, deletedAt: message.deletedAt?.toISOString() ?? null,
            isPinned: message.isPinned, replyToId: message.replyToId,
            replyTo: message.replyTo ?? null,
            reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({ emoji, userIds })),
            attachmentFile: message.attachmentFile ?? null,
            sender: { displayName: message.sender.displayName, avatarUrl: message.sender.avatarUrl },
          };
        }),
      }
    : null;
  const participants = meeting.participants.map((participant) => ({
    id: participant.id,
    userId: participant.userId,
    status: participant.status,
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    leftAt: participant.leftAt?.toISOString() ?? null,
    handRaised: Boolean(
      participant.handRaisedAt &&
        (!participant.handLoweredAt || participant.handLoweredAt < participant.handRaisedAt),
    ),
    user: {
      displayName: participant.user.displayName,
      email: participant.user.email,
      avatarUrl: participant.user.avatarUrl,
    },
  }));
  const accessRequests = pendingRequests.map((request) => ({
    id: request.id,
    userId: request.userId,
    targetType: request.targetType,
    artifactId: request.artifactId,
    user: request.user,
    artifactTitle: request.artifact?.note?.title ?? null,
  }));
  const artifacts = meeting.artifacts.map((artifact) => ({
    id: artifact.id,
    type: artifact.type,
    source: artifact.source,
    createdAt: artifact.createdAt.toISOString(),
    title: artifact.note?.title ?? artifact.file?.name ?? "Untitled artifact",
    detail:
      artifact.note?.owner?.displayName ??
      artifact.file?.uploadedBy.displayName ??
      artifact.createdBy.displayName,
    fileId: artifact.file?.id ?? null,
    fileSizeBytes: artifact.file?.sizeBytes ?? null,
    noteType: artifact.note?.type ?? null,
  }));

  const pendingCall = meeting.pendingCall;
  const callPending =
    pendingCall &&
    pendingCall.calleeId !== currentUser.id &&
    pendingCall.expiresAt > new Date()
      ? {
          pendingCallId: pendingCall.id,
          calleeDisplayName:
            participants.find((p) => p.userId === pendingCall.calleeId)?.user.displayName ?? "them",
          expiresAt: pendingCall.expiresAt.toISOString(),
        }
      : undefined;
  const callIncoming =
    pendingCall &&
    pendingCall.calleeId === currentUser.id &&
    pendingCall.expiresAt > new Date()
      ? {
          pendingCallId: pendingCall.id,
          callerId: pendingCall.callerId,
          callerName:
            participants.find((p) => p.userId === pendingCall.callerId)?.user.displayName ?? "Someone",
          callerAvatarUrl:
            participants.find((p) => p.userId === pendingCall.callerId)?.user.avatarUrl ?? null,
          meetingId: meeting.id,
          workspaceId: id,
          expiresAt: pendingCall.expiresAt.toISOString(),
        }
      : undefined;

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
        canRecord={meeting.workspace.plan !== "FREE"}
        disabled={!isVideoOpen}
        waitingRoom={meeting.waitingRoom}
        canModerate={canModerate}
        recordingStatusMessage={getRecordingStatusMessage(recordingStatus)}
        recording={{
          activeRecording,
          canManage: canManageRecording,
          latestRecording,
        }}
        permissions={permissions}
        participants={participants}
        accessRequests={accessRequests}
        context={{
          description: meeting.description,
          startsAt: meeting.startsAt.toISOString(),
          endsAt: meeting.endsAt?.toISOString() ?? null,
          artifacts,
        }}
        chat={{
          roomId: meetingChannel ? createChatRoomId(id, meetingChannel.id) : createChatRoomId(id, meeting.id),
          channel: meetingChannel,
          currentUserId: currentUser.id,
          currentUserDisplayName: currentUser.displayName,
          currentUserAvatarUrl: currentUser.avatarUrl,
          canModerateChat,
          initialPolls,
          canCreatePolls: canCreatePoll,
          openInChannelsHref: meetingChannel ? `/workspaces/${id}/chat?channel=${meetingChannel.id}` : undefined,
        }}
        callPending={callPending}
        callIncoming={callIncoming}
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
    case "plan-limit":
      return "Recording is not available on the Free plan. Upgrade to Pro to record meetings.";
    case "stop-failed":
      return "Recording could not be stopped.";
    default:
      return null;
  }
}
