import { NextResponse } from "next/server";
import type { MobileWorkspaceMembersResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { getActiveMembership, mobileForbidden, mobileUnauthorized } from "@/lib/mobile-api";
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

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: "ACTIVE" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: {
          displayName: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const response: MobileWorkspaceMembersResponse = {
    members: members.map((member) => ({
      id: member.id,
      role: member.role,
      displayName: member.user.displayName,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      joinedAt: member.createdAt.toISOString(),
    })),
  };

  return NextResponse.json(response);
}
