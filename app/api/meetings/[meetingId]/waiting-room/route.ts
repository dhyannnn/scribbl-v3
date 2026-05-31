import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canModerateMeeting } from "@/lib/meeting-permissions";
import { prisma } from "@/lib/prisma";

const HEARTBEAT_TIMEOUT_MS = 30_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId },
    select: {
      createdByUserId: true,
      waitingRoom: true,
      workspace: {
        select: {
          members: {
            where: { userId: currentUser.id, status: "ACTIVE" },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!meeting) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const role = meeting.workspace?.members[0]?.role;
  if (!role) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (!canModerateMeeting({ currentUserId: currentUser.id, meetingCreatedByUserId: meeting.createdByUserId, currentUserRole: role })) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const waitingUsers = await prisma.meetingWaitingUser.findMany({
    where: { meetingId, lastHeartbeatAt: { gte: cutoff } },
    select: { userId: true, displayName: true, avatarUrl: true, requestedAt: true },
    orderBy: { requestedAt: "asc" },
  });

  return NextResponse.json({ waitingUsers });
}
