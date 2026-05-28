import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // Workspaces the user belongs to
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: currentUser.id, status: "ACTIVE" },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  if (workspaceIds.length === 0 && !q) {
    return NextResponse.json({ workspaces: [], notes: [], meetings: [], channels: [] });
  }

  const textFilter = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const [workspaces, notes, meetings, channels] = await Promise.all([
    // Workspaces
    prisma.workspace.findMany({
      where: {
        id: { in: workspaceIds },
        ...(textFilter ? { name: textFilter } : {}),
      },
      select: { id: true, name: true, type: true },
      take: 5,
      orderBy: { name: "asc" },
    }),

    // Notes — owned or workspace-shared in member workspaces
    workspaceIds.length > 0
      ? prisma.note.findMany({
          where: {
            deletedAt: null,
            ...(textFilter ? { title: textFilter } : {}),
            OR: [
              { ownerUserId: currentUser.id },
              {
                workspaceId: { in: workspaceIds },
                visibility: "WORKSPACE_SHARED",
              },
            ],
          },
          select: { id: true, title: true, type: true, workspaceId: true },
          take: 8,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),

    // Meetings — not cancelled, in member workspaces
    workspaceIds.length > 0
      ? prisma.meeting.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            ...(textFilter ? { title: textFilter } : {}),
          },
          select: {
            id: true,
            title: true,
            startsAt: true,
            workspaceId: true,
          },
          take: 8,
          orderBy: { startsAt: "desc" },
        })
      : Promise.resolve([]),

    // Channels
    workspaceIds.length > 0
      ? prisma.channel.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            ...(textFilter ? { name: textFilter } : {}),
          },
          select: { id: true, name: true, type: true, workspaceId: true },
          take: 5,
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ workspaces, notes, meetings, channels });
}
