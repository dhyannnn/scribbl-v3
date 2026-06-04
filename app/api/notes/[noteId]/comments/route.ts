import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const { noteId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json([], { status: 401 });

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
