import { Liveblocks } from "@liveblocks/node";
import { getCurrentUser } from "@/lib/current-user";
import { parseChatRoomId, parseMeetingChatRoomId, parseNoteRoomId } from "@/lib/liveblocks-room";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const liveblocksSecret = process.env.LIVEBLOCKS_SECRET_KEY;
const liveblocks = liveblocksSecret ? new Liveblocks({ secret: liveblocksSecret }) : null;

export async function POST(request: Request) {
  const startedAt = performance.now();
  if (!liveblocks) {
    return Response.json(
      {
        error: "forbidden",
        reason: "Liveblocks is not configured.",
      },
      { status: 403 },
    );
  }

  let payload: { room?: unknown };

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "forbidden", reason: "Invalid request." }, { status: 400 });
  }

  const room = typeof payload.room === "string" ? payload.room : "";
  const parsedRoom = parseNoteRoomId(room);
  const parsedMeetingChatRoom = parseMeetingChatRoomId(room);
  const parsedChatRoom = parseChatRoomId(room);

  if (!parsedRoom && !parsedMeetingChatRoom && !parsedChatRoom) {
    return Response.json({ error: "forbidden", reason: "Unknown room." }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  const userResolvedAt = performance.now();

  if (!currentUser) {
    return Response.json({ error: "forbidden", reason: "Unknown user." }, { status: 403 });
  }

  const session = liveblocks.prepareSession(currentUser.id, {
    userInfo: {
      name: currentUser.displayName,
      email: currentUser.email,
      avatarUrl: currentUser.avatarUrl ?? null,
    },
  });

  if (parsedMeetingChatRoom) {
    const meeting = await prisma.meeting.findFirst({
      where: {
        id: parsedMeetingChatRoom.meetingId,
        workspaceId: parsedMeetingChatRoom.workspaceId,
        workspace: {
          members: {
            some: {
              userId: currentUser.id,
              status: "ACTIVE",
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
    const accessCheckedAt = performance.now();

    if (!meeting) {
      return Response.json({ error: "forbidden", reason: "No room access." }, { status: 403 });
    }

    session.allow(room, session.FULL_ACCESS);

    const authorizeStartedAt = performance.now();
    const { status, body } = await session.authorize();
    const authorizeFinishedAt = performance.now();

    logLiveblocksAuthTiming("meeting-chat", room, startedAt, userResolvedAt, accessCheckedAt, authorizeStartedAt, authorizeFinishedAt);
    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  if (parsedChatRoom) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: parsedChatRoom.channelId,
        workspaceId: parsedChatRoom.workspaceId,
        workspace: {
          members: {
            some: {
              userId: currentUser.id,
              status: "ACTIVE",
            },
          },
        },
      },
      select: {
        id: true,
      },
    });
    const accessCheckedAt = performance.now();

    if (!channel) {
      return Response.json({ error: "forbidden", reason: "No room access." }, { status: 403 });
    }

    session.allow(room, session.FULL_ACCESS);

    const authorizeStartedAt = performance.now();
    const { status, body } = await session.authorize();
    const authorizeFinishedAt = performance.now();

    logLiveblocksAuthTiming("chat", room, startedAt, userResolvedAt, accessCheckedAt, authorizeStartedAt, authorizeFinishedAt);
    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  if (!parsedRoom) {
    return Response.json({ error: "forbidden", reason: "Unknown room." }, { status: 403 });
  }

  const note = await prisma.note.findFirst({
    where: {
      id: parsedRoom.noteId,
      workspaceId: parsedRoom.workspaceId,
      deletedAt: null,
      workspace: {
        members: {
          some: {
            userId: currentUser.id,
            status: "ACTIVE",
          },
        },
      },
      OR: [
        { visibility: "WORKSPACE_SHARED" },
        { visibility: "PRIVATE", ownerUserId: currentUser.id },
      ],
    },
    select: {
      artifacts: {
        select: {
          source: true,
          meeting: {
            select: {
              startsAt: true,
              endsAt: true,
              canceledAt: true,
            },
          },
        },
      },
    },
  });
  const accessCheckedAt = performance.now();

  if (!note) {
    return Response.json({ error: "forbidden", reason: "No room access." }, { status: 403 });
  }

  // READ_ACCESS only when the meeting has ended and the note is locked.
  // Edit permission (canEdit prop + server action) is enforced at the TipTap/
  // action layer — not here. Gating Liveblocks auth on permissions caused stale
  // READ_ACCESS tokens to persist after a moderator granted access mid-session.
  const lockedByMeeting = note.artifacts.some(
    (artifact) =>
      artifact.source === "CREATED_IN_MEETING" &&
      artifact.meeting &&
      !canEditMeetingNotes(getMeetingLifecycle(artifact.meeting)),
  );

  session.allow(room, lockedByMeeting ? session.READ_ACCESS : session.FULL_ACCESS);

  const authorizeStartedAt = performance.now();
  const { status, body } = await session.authorize();
  const authorizeFinishedAt = performance.now();

  logLiveblocksAuthTiming("note", room, startedAt, userResolvedAt, accessCheckedAt, authorizeStartedAt, authorizeFinishedAt);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function logLiveblocksAuthTiming(
  kind: string,
  room: string,
  startedAt: number,
  userResolvedAt: number,
  accessCheckedAt: number,
  authorizeStartedAt: number,
  authorizeFinishedAt: number,
) {
  const totalMs = Math.round(performance.now() - startedAt);

  if (totalMs < 750) {
    return;
  }

  logger.warn("Slow Liveblocks auth", {
    kind,
    room,
    totalMs,
    userMs: Math.round(userResolvedAt - startedAt),
    accessMs: Math.round(accessCheckedAt - userResolvedAt),
    authorizeMs: Math.round(authorizeFinishedAt - authorizeStartedAt),
    responseMs: Math.round(performance.now() - authorizeFinishedAt),
  });
}
