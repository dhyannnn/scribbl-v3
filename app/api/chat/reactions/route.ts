import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") return { messageId: "", emoji: "" };
  const b = body as Record<string, unknown>;
  return {
    messageId: typeof b.messageId === "string" ? b.messageId : "",
    emoji: typeof b.emoji === "string" ? b.emoji : "",
  };
}

async function canAccessMessage(messageId: string, userId: string) {
  const message = await prisma.message.findFirst({
    where: { id: messageId },
    select: {
      channel: {
        select: {
          workspaceId: true,
          workspace: {
            select: {
              members: {
                where: { userId, status: "ACTIVE" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  return (message?.channel.workspace?.members.length ?? 0) > 0;
}

// POST — toggle reaction (add if absent, remove if present)
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const { messageId, emoji } = parseBody(body);
  if (!messageId || !emoji) return NextResponse.json({ error: "messageId and emoji are required." }, { status: 400 });
  const graphemes = [...new Intl.Segmenter().segment(emoji)];
  if (graphemes.length !== 1) return NextResponse.json({ error: "Invalid emoji." }, { status: 400 });

  if (!(await canAccessMessage(messageId, currentUser.id))) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: currentUser.id, emoji } },
    select: { id: true },
  });

  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
    return NextResponse.json({ action: "removed", messageId, emoji, userId: currentUser.id });
  } else {
    await prisma.messageReaction.create({ data: { messageId, userId: currentUser.id, emoji } });
    return NextResponse.json({ action: "added", messageId, emoji, userId: currentUser.id });
  }
}
