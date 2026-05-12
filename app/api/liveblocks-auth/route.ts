import { Liveblocks } from "@liveblocks/node";
import { getCurrentUser } from "@/lib/current-user";
import { parseChatRoomId, parseMeetingChatRoomId, parseNoteRoomId } from "@/lib/liveblocks-room";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

const liveblocksSecret = process.env.LIVEBLOCKS_SECRET_KEY;
const liveblocks = liveblocksSecret ? new Liveblocks({ secret: liveblocksSecret }) : null;

export async function POST(request: Request) {
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

  if (!currentUser) {
    return Response.json({ error: "forbidden", reason: "Unknown user." }, { status: 403 });
  }

  const session = liveblocks.prepareSession(currentUser.id, {
    userInfo: {
      name: currentUser.displayName,
      email: currentUser.email,
    },
  });

  if (parsedMeetingChatRoom) {
    const [meeting, membership] = await Promise.all([
      prisma.meeting.findFirst({
        where: {
          id: parsedMeetingChatRoom.meetingId,
          workspaceId: parsedMeetingChatRoom.workspaceId,
        },
        select: {
          id: true,
        },
      }),
      prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: parsedMeetingChatRoom.workspaceId,
            userId: currentUser.id,
          },
        },
        select: {
          status: true,
        },
      }),
    ]);

    if (!meeting || membership?.status !== "ACTIVE") {
      return Response.json({ error: "forbidden", reason: "No room access." }, { status: 403 });
    }

    session.allow(room, session.FULL_ACCESS);

    const { status, body } = await session.authorize();

    return new Response(body, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  if (parsedChatRoom) {
    const [channel, membership] = await Promise.all([
      prisma.channel.findFirst({
        where: {
          id: parsedChatRoom.channelId,
          workspaceId: parsedChatRoom.workspaceId,
        },
        select: {
          id: true,
        },
      }),
      prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: parsedChatRoom.workspaceId,
            userId: currentUser.id,
          },
        },
        select: {
          status: true,
        },
      }),
    ]);

    if (!channel || membership?.status !== "ACTIVE") {
      return Response.json({ error: "forbidden", reason: "No room access." }, { status: 403 });
    }

    session.allow(room, session.FULL_ACCESS);

    const { status, body } = await session.authorize();

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

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: {
        id: parsedRoom.noteId,
        workspaceId: parsedRoom.workspaceId,
        deletedAt: null,
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
    }),
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: parsedRoom.workspaceId,
          userId: currentUser.id,
        },
      },
      select: { status: true },
    }),
  ]);

  if (!note || membership?.status !== "ACTIVE") {
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

  const { status, body } = await session.authorize();

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
