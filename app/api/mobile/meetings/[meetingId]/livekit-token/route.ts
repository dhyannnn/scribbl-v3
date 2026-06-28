import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import type { MobileMeetingVideoTokenResponse } from "@scribbl/shared";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canJoinMeeting, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { canModerateMeeting, getMeetingVideoPermissions, type MeetingPermissionOverrideInput } from "@/lib/meeting-permissions";
import { isValidClientSessionId } from "@/lib/meeting-video-session";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileBadRequest, mobileForbidden, mobileUnauthorized } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const currentUser = await getCurrentMobileUser(request);
  if (!currentUser) return mobileUnauthorized();

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
    return mobileBadRequest("Invalid request body.");
  }

  const { meetingId } = await context.params;
  const { workspaceId, clientSessionId, force } = parseBody(body);

  if (!workspaceId || !meetingId || !clientSessionId) {
    return mobileBadRequest("Workspace and meeting are required.");
  }

  if (!isValidClientSessionId(clientSessionId)) {
    return mobileBadRequest("Invalid video session.");
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

  if (!meeting || meeting.participants.length === 0 || !meeting.workspace || meeting.workspace.members.length === 0) {
    return mobileForbidden();
  }

  if (!canJoinMeeting(getMeetingLifecycle(meeting))) {
    return NextResponse.json({ error: "This meeting is not open for video yet." }, { status: 409 });
  }

  const currentMembership = meeting.workspace.members[0];
  if (!currentMembership) return mobileForbidden();

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

        const response: MobileMeetingVideoTokenResponse = { waiting: true };
        return NextResponse.json(response);
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
  ].filter((source): source is TrackSource => source !== null);
  const roomName = createLiveKitMeetingRoomName(meeting.id);

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
      const response: MobileMeetingVideoTokenResponse = {
        conflict: true,
        error: "You are already in this meeting from another device.",
      };
      return NextResponse.json(response, { status: 409 });
    }

    try {
      const roomService = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
      await roomService.removeParticipant(roomName, currentUser.id);
    } catch {
      // The old participant may already be gone from LiveKit.
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

  const response: MobileMeetingVideoTokenResponse = {
    roomName,
    serverUrl: livekitUrl,
    token: await token.toJwt(),
    permissions,
  };

  return NextResponse.json(response);
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return { workspaceId: "", clientSessionId: "", force: false };
  }

  const maybeBody = body as {
    workspaceId?: unknown;
    clientSessionId?: unknown;
    force?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    clientSessionId: typeof maybeBody.clientSessionId === "string" ? maybeBody.clientSessionId : "",
    force: maybeBody.force === true,
  };
}
