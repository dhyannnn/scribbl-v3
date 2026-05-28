import { NextResponse } from "next/server";
import type { MobileChannelsResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { canAccessWorkspace, mobileForbidden, mobileUnauthorized, serializeChannel } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const { workspaceId } = await context.params;
  if (!(await canAccessWorkspace(workspaceId, user.id))) return mobileForbidden();

  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      OR: [
        { type: { not: "DIRECT" } },
        { dmUser1Id: user.id },
        { dmUser2Id: user.id },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      type: true,
      updatedAt: true,
    },
    orderBy: [{ type: "asc" }, { updatedAt: "desc" }],
  });

  const response: MobileChannelsResponse = {
    channels: channels.map(serializeChannel),
  };

  return NextResponse.json(response);
}
