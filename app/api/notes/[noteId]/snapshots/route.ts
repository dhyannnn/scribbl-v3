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

  const snapshots = await prisma.noteSnapshot.findMany({
    where: { noteId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      user: { select: { displayName: true } },
    },
  });

  return NextResponse.json(snapshots);
}
