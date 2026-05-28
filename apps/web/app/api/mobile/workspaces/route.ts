import { NextResponse } from "next/server";
import type { MobileWorkspacesResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileUnauthorized, serializeWorkspace } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          plan: true,
          description: true,
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const response: MobileWorkspacesResponse = {
    workspaces: memberships.map(serializeWorkspace),
  };

  return NextResponse.json(response);
}
