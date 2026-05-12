import { AccessToken, TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canJoinMeeting, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { getMeetingVideoPermissions, type MeetingPermissionOverrideInput } from "@/lib/meeting-permissions";
import { isValidClientSessionId } from "@/lib/meeting-video-session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return NextResponse.json({ error: "LiveKit is not configured." }, { status: 503 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { workspaceId, meetingId, clientSessionId } = parseBody(body);

  if (!workspaceId || !meetingId || !clientSessionId) {
    return NextResponse.json({ error: "Workspace and meeting are required." }, { status: 400 });
  }

  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      workspaceId,
    },
    select: {
      id: true,
      createdByUserId: true,
      startsAt: true,
      endsAt: true,
      canceledAt: true,
      moderationSettings: true,
      permissionOverrides: {
        where: {
          userId: currentUser.id,
        },
        select: {
          userId: true,
          targetType: true,
          artifactId: true,
          state: true,
        },
      },
      participants: {
        where: {
          userId: currentUser.id,
        },
        select: {
          id: true,
        },
        take: 1,
      },
      workspace: {
        select: {
          members: {
            where: {
              userId: currentUser.id,
              status: "ACTIVE",
            },
            select: {
              id: true,
              role: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!isValidClientSessionId(clientSessionId)) {
    return NextResponse.json({ error: "Invalid video session." }, { status: 400 });
  }

  if (!meeting || meeting.participants.length === 0 || meeting.workspace?.members.length === 0) {
    return NextResponse.json({ error: "You do not have access to this meeting." }, { status: 403 });
  }

  if (!canJoinMeeting(getMeetingLifecycle(meeting))) {
    return NextResponse.json({ error: "This meeting is not open for video yet." }, { status: 409 });
  }

  const currentMembership = meeting.workspace?.members[0];

  if (!currentMembership) {
    return NextResponse.json({ error: "You do not have access to this meeting." }, { status: 403 });
  }

  const permissions = getMeetingVideoPermissions({
    currentUserId: currentUser.id,
    meetingCreatedByUserId: meeting.createdByUserId,
    currentUserRole: currentMembership.role,
    settings: meeting.moderationSettings,
    overrides: meeting.permissionOverrides as MeetingPermissionOverrideInput[],
  });
  const canPublishSources = [
    permissions.canUseCamera ? TrackSource.CAMERA : null,
    permissions.canUseMic ? TrackSource.MICROPHONE : null,
    permissions.canShareScreen ? TrackSource.SCREEN_SHARE : null,
    permissions.canShareScreen ? TrackSource.SCREEN_SHARE_AUDIO : null,
  ].filter((source): source is TrackSource => source !== null);

  const roomName = createLiveKitMeetingRoomName(meeting.id);
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: currentUser.id,
    name: currentUser.displayName,
    ttl: "2h",
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: canPublishSources.length > 0,
    canPublishSources,
    canPublishData: permissions.canSendReactions || permissions.canRaiseHand || permissions.canModerateVideo,
    canSubscribe: true,
  });

  return NextResponse.json({
    roomName,
    serverUrl: livekitUrl,
    token: await token.toJwt(),
    permissions,
  });
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      workspaceId: "",
      meetingId: "",
      clientSessionId: "",
    };
  }

  const maybeBody = body as {
    workspaceId?: unknown;
    meetingId?: unknown;
    clientSessionId?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    meetingId: typeof maybeBody.meetingId === "string" ? maybeBody.meetingId : "",
    clientSessionId: typeof maybeBody.clientSessionId === "string" ? maybeBody.clientSessionId : "",
  };
}
