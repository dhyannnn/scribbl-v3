import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { startMeetingVideoSession } from "@/lib/meeting-video-session";
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
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "You do not have access to this meeting." }, { status: 403 });
  }

  const session = await startMeetingVideoSession({
    workspaceId,
    meetingId: meeting.id,
    userId: currentUser.id,
    clientSessionId,
    markParticipantJoined: false,
  });

  if (!session.ok && session.reason === "not-open") {
    return NextResponse.json({ error: "This meeting is not open for video yet." }, { status: 409 });
  }

  if (!session.ok && session.reason === "invalid-session") {
    return NextResponse.json({ error: "Invalid video session." }, { status: 400 });
  }

  if (!session.ok) {
    return NextResponse.json({ error: "You do not have access to this meeting." }, { status: 403 });
  }

  const roomName = createLiveKitMeetingRoomName(meeting.id);
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: currentUser.id,
    name: currentUser.displayName,
    ttl: "2h",
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return NextResponse.json({
    roomName,
    serverUrl: livekitUrl,
    token: await token.toJwt(),
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
