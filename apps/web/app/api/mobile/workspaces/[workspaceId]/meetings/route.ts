import { NextResponse } from "next/server";
import type { MobileMeetingsResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { getActiveMembership, mobileForbidden, mobileUnauthorized, serializeMeeting } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const { workspaceId } = await context.params;
  const membership = await getActiveMembership(workspaceId, user.id);
  if (membership?.status !== "ACTIVE") return mobileForbidden();

  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";
  const meetings = await prisma.meeting.findMany({
    where: {
      workspaceId,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { groupId: null },
              { group: { members: { some: { userId: user.id } } } },
            ],
          }),
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      canceledAt: true,
      workspace: { select: { name: true } },
      participants: {
        where: { userId: user.id },
        select: { status: true },
        take: 1,
      },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });

  const response: MobileMeetingsResponse = {
    meetings: meetings.map(serializeMeeting).filter((meeting) => meeting !== null),
  };

  return NextResponse.json(response);
}
