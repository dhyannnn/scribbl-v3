import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canJoinMeeting, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { canModerateMeeting, getMeetingVideoPermissions, type MeetingPermissionOverrideInput } from "@/lib/meeting-permissions";
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

  const { workspaceId, meetingId, clientSessionId, force } = parseBody(body);

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
      waitingRoom: true,
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

  // Waiting room check — non-hosts must be admitted before getting a token
  if (meeting.waitingRoom) {
    const isHost = canModerateMeeting({
      currentUserId: currentUser.id,
      meetingCreatedByUserId: meeting.createdByUserId,
      currentUserRole: currentMembership.role,
    });

    if (!isHost) {
      const admission = await prisma.meetingAdmission.findUnique({
        where: { meetingId_userId: { meetingId, userId: currentUser.id } },
        select: { id: true },
      });

      if (!admission) {
        // Register/heartbeat in the waiting list
        await prisma.meetingWaitingUser.upsert({
          where: { meetingId_userId: { meetingId, userId: currentUser.id } },
          create: {
            meetingId,
            userId: currentUser.id,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl ?? null,
          },
          update: { lastHeartbeatAt: new Date() },
        });
        return NextResponse.json({ waiting: true });
      }
    }
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

  // Check for an active session from a different device
  const existingSession = await prisma.meetingVideoSession.findFirst({
    where: {
      meetingId,
      userId: currentUser.id,
      disconnectedAt: null,
      clientSessionId: { not: clientSessionId },
    },
    select: { id: true },
  });

  if (existingSession) {
    if (!force) {
      return NextResponse.json(
        { conflict: true, error: "You are already in this meeting from another device." },
        { status: 409 },
      );
    }
    // force=true: kick the old session from LiveKit then let this one in
    try {
      const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
      await roomService.removeParticipant(roomName, currentUser.id);
    } catch {
      // Participant may have already left — safe to continue
    }
  }

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
    return { workspaceId: "", meetingId: "", clientSessionId: "", force: false };
  }

  const maybeBody = body as {
    workspaceId?: unknown;
    meetingId?: unknown;
    clientSessionId?: unknown;
    force?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    meetingId: typeof maybeBody.meetingId === "string" ? maybeBody.meetingId : "",
    clientSessionId: typeof maybeBody.clientSessionId === "string" ? maybeBody.clientSessionId : "",
    force: maybeBody.force === true,
  };
}
