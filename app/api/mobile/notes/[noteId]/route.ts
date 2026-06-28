import { NextResponse } from "next/server";
import type { MobileNoteResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileForbidden, mobileUnauthorized, serializeNoteDetail } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const { noteId } = await context.params;
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      deletedAt: null,
      OR: [
        { ownerUserId: user.id },
        { collaborators: { some: { userId: user.id } } },
        {
          visibility: "WORKSPACE_SHARED",
          workspace: { members: { some: { userId: user.id, status: "ACTIVE" } } },
        },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      type: true,
      visibility: true,
      updatedAt: true,
      contentJson: true,
      owner: { select: { displayName: true } },
    },
  });

  if (!note) return mobileForbidden();

  const response: MobileNoteResponse = {
    note: serializeNoteDetail(note),
  };

  return NextResponse.json(response);
}
