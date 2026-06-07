import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const pendingCall = await prisma.pendingCall.findUnique({
    where: { id },
    select: {
      id: true,
      callerId: true,
      calleeId: true,
      meetingId: true,
      expiresAt: true,
      meeting: { select: { workspaceId: true } },
    },
  });

  if (!pendingCall) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Only the caller or callee may fetch this
  if (pendingCall.calleeId !== currentUser.id && pendingCall.callerId !== currentUser.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const caller = await prisma.user.findUnique({
    where: { id: pendingCall.callerId },
    select: { displayName: true, avatarUrl: true },
  });

  return NextResponse.json({
    pendingCallId: pendingCall.id,
    callerId: pendingCall.callerId,
    callerName: caller?.displayName ?? "Someone",
    callerAvatarUrl: caller?.avatarUrl ?? null,
    meetingId: pendingCall.meetingId,
    workspaceId: pendingCall.meeting.workspaceId,
    expiresAt: pendingCall.expiresAt.toISOString(),
  });
}
