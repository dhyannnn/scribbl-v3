import { NextResponse } from "next/server";
import type { MobileNotesResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { canAccessWorkspace, mobileForbidden, mobileUnauthorized, serializeNoteSummary } from "@/lib/mobile-api";
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

  const notes = await prisma.note.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [
        { visibility: "WORKSPACE_SHARED" },
        { ownerUserId: user.id },
        { collaborators: { some: { userId: user.id } } },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      type: true,
      visibility: true,
      updatedAt: true,
      owner: { select: { displayName: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const response: MobileNotesResponse = {
    notes: notes.map(serializeNoteSummary),
  };

  return NextResponse.json(response);
}
