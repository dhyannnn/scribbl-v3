import { NextResponse } from "next/server";
import type { MobileMeetingVideoAttendance, MobileMeetingVideoSessionResponse } from "@scribbl/shared";
import { endMeetingVideoSession, startMeetingVideoSession } from "@/lib/meeting-video-session";
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return mobileBadRequest("Invalid request body.");
  }

  const { meetingId } = await context.params;
  const { workspaceId, clientSessionId, attendance } = parseBody(body);

  if (!workspaceId || !meetingId || !clientSessionId || !attendance) {
    return mobileBadRequest("Workspace, meeting, and attendance are required.");
  }

  const result = attendance === "joined"
    ? await startMeetingVideoSession({
        workspaceId,
        meetingId,
        userId: currentUser.id,
        clientSessionId,
      })
    : await endMeetingVideoSession({
        workspaceId,
        meetingId,
        userId: currentUser.id,
        clientSessionId,
      });

  if (!result.ok) {
    if (result.reason === "access-denied") return mobileForbidden();
    if (result.reason === "not-open") {
      return NextResponse.json({ error: "This meeting is not open for video yet." }, { status: 409 });
    }
    return mobileBadRequest("Invalid video session.");
  }

  if (attendance === "joined") {
    const prevStatus = currentUser.status !== "IN_MEETING"
      ? currentUser.status
      : (currentUser.previousStatus ?? "ONLINE");
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { status: "IN_MEETING", previousStatus: prevStatus },
    });
  } else {
    const restoreStatus = currentUser.previousStatus ?? "ONLINE";
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { status: restoreStatus, previousStatus: null },
    });
  }

  const response: MobileMeetingVideoSessionResponse = { ok: true };
  return NextResponse.json(response);
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return { workspaceId: "", clientSessionId: "", attendance: null };
  }

  const maybeBody = body as {
    workspaceId?: unknown;
    clientSessionId?: unknown;
    attendance?: unknown;
  };
  const attendance = maybeBody.attendance === "joined" || maybeBody.attendance === "left"
    ? maybeBody.attendance
    : null;

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    clientSessionId: typeof maybeBody.clientSessionId === "string" ? maybeBody.clientSessionId : "",
    attendance: attendance as MobileMeetingVideoAttendance | null,
  };
}
