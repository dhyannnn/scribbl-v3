import "server-only";

import { Liveblocks } from "@liveblocks/node";
import { prisma } from "@/lib/prisma";
import { createNoteRoomId, createChatRoomId, createMeetingChatRoomId } from "@/lib/liveblocks-room";

const liveblocks = process.env.LIVEBLOCKS_SECRET_KEY
  ? new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
  : null;

// Broadcasts a kick event to every Liveblocks room in the workspace for the
// given userId. The client-side KickListener in LiveblocksRoom.tsx handles the
// event and redirects the user to the dashboard.
export async function broadcastWorkspaceKick(workspaceId: string, userId: string) {
  if (!liveblocks) return;

  const [notes, channels, meetings] = await Promise.all([
    prisma.note.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true },
    }),
    prisma.channel.findMany({
      where: { workspaceId },
      select: { id: true },
    }),
    prisma.meeting.findMany({
      where: { workspaceId, canceledAt: null },
      select: { id: true },
    }),
  ]);

  const roomIds = [
    ...notes.map((n) => createNoteRoomId(workspaceId, n.id)),
    ...channels.map((c) => createChatRoomId(workspaceId, c.id)),
    ...meetings.map((m) => createMeetingChatRoomId(workspaceId, m.id)),
  ];

  await Promise.allSettled(
    roomIds.map((roomId) =>
      liveblocks!.broadcastEvent(roomId, { type: "WORKSPACE_KICK", userId }),
    ),
  );
}
