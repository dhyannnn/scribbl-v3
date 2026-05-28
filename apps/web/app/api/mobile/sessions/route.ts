import { NextResponse } from "next/server";
import type { MobileMeetingsResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileUnauthorized, serializeMeeting } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { role: true, workspaceId: true },
  });
  const adminWorkspaceIds = memberships
    .filter((membership) => membership.role === "OWNER" || membership.role === "ADMIN")
    .map((membership) => membership.workspaceId);
  const memberWorkspaceIds = memberships
    .filter((membership) => membership.role === "MEMBER")
    .map((membership) => membership.workspaceId);

  const meetings = memberships.length > 0
    ? await prisma.meeting.findMany({
        where: {
          workspaceId: { in: memberships.map((membership) => membership.workspaceId) },
          canceledAt: null,
          startsAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          OR: [
            ...(adminWorkspaceIds.length > 0 ? [{ workspaceId: { in: adminWorkspaceIds } }] : []),
            ...(memberWorkspaceIds.length > 0
              ? [{
                  workspaceId: { in: memberWorkspaceIds },
                  OR: [
                    { groupId: null },
                    { group: { members: { some: { userId: user.id } } } },
                  ],
                }]
              : []),
          ],
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
        orderBy: { startsAt: "asc" },
        take: 25,
      })
    : [];

  const response: MobileMeetingsResponse = {
    meetings: meetings.map(serializeMeeting).filter((meeting) => meeting !== null),
  };

  return NextResponse.json(response);
}
