import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!note?.workspaceId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: note.workspaceId, userId: currentUser.id } },
    select: { status: true },
  });
  if (membership?.status !== "ACTIVE") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const comments = await prisma.noteComment.findMany({
    where: { noteId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      commentId: true,
      text: true,
      resolvedAt: true,
      parentCommentId: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
  });

  return NextResponse.json(comments);
}
