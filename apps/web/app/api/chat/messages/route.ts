import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  chatMessageFullSelect,
  createChatMessage,
  createChatMessageNotifications,
  logChatNotificationFailure,
} from "@/lib/chat-message-write";
import { getCurrentUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const maxMessageLength = 2000;

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const channelId = searchParams.get("channelId") ?? "";

  if (!workspaceId || !channelId) {
    return NextResponse.json({ error: "workspaceId and channelId are required." }, { status: 400 });
  }

  const channel = await prisma.channel.findFirst({
    where: {
      id: channelId,
      workspaceId,
      workspace: {
        members: { some: { userId: currentUser.id, status: "ACTIVE" } },
      },
      OR: [
        { type: { not: "DIRECT" } },
        { dmUser1Id: currentUser.id },
        { dmUser2Id: currentUser.id },
      ],
    },
    select: { id: true },
  });

  if (!channel) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null },
    select: chatMessageFullSelect,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    messages: messages.reverse().map((message) => serializeMessage(message, message.sender)),
  });
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const currentUser = await getCurrentUser();
  const userResolvedAt = performance.now();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceId, channelId, body, replyToId, attachmentFileId } = parseBody(await readJson(request));

  const result = await createChatMessage({
    user: currentUser,
    workspaceId,
    channelId,
    body,
    replyToId,
    attachmentFileId,
  });
  const accessCheckedAt = performance.now();

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const messageCreatedAt = performance.now();
  logChatTiming("create", startedAt, userResolvedAt, accessCheckedAt, messageCreatedAt);

  after(() => {
    void createChatMessageNotifications(result.notification).catch((error) => {
      logChatNotificationFailure({
        workspaceId: result.notification.workspaceId,
        channelId: result.notification.channelId,
      }, error);
    });
  });

  return NextResponse.json({
    message: serializeMessage(result.message, {
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
    }),
  });
}

function logChatTiming(
  action: string,
  startedAt: number,
  userResolvedAt: number,
  accessCheckedAt: number,
  completedAt: number,
) {
  const totalMs = Math.round(completedAt - startedAt);

  if (totalMs < 750) {
    return;
  }

  logger.warn("Slow chat action", {
    action,
    totalMs,
    userMs: Math.round(userResolvedAt - startedAt),
    accessMs: Math.round(accessCheckedAt - userResolvedAt),
    writeMs: Math.round(completedAt - accessCheckedAt),
  });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { workspaceId, messageId, body, pin } = parseBody(await readJson(request));
  if (!workspaceId || !messageId) return NextResponse.json({ error: "messageId required." }, { status: 400 });

  // Pin/unpin — requires OWNER or ADMIN
  if (pin !== null) {
    const [membership, message] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
        select: { role: true, status: true },
      }),
      prisma.message.findFirst({
        where: { id: messageId, deletedAt: null, channel: { workspaceId } },
        select: { id: true },
      }),
    ]);
    if (membership?.status !== "ACTIVE" || !message) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      return NextResponse.json({ error: "Only admins can pin messages." }, { status: 403 });
    }
    const pinned = await prisma.message.update({
      where: { id: message.id },
      data: { isPinned: pin },
      select: messageFullSelect,
    });
    return NextResponse.json({ message: serializeMessage(pinned, pinned.sender) });
  }

  // Edit body — sender only
  if (!body) return NextResponse.json({ error: "Message body required." }, { status: 400 });
  if (body.length > maxMessageLength) return NextResponse.json({ error: "Message too long." }, { status: 400 });

  const message = await prisma.message.findFirst({
    where: {
      id: messageId, senderUserId: currentUser.id, deletedAt: null,
      channel: { workspaceId, workspace: { members: { some: { userId: currentUser.id, status: "ACTIVE" } } } },
    },
    select: { id: true },
  });
  if (!message) return NextResponse.json({ error: "You do not have permission to edit this message." }, { status: 403 });

  const updatedMessage = await prisma.message.update({
    where: { id: message.id },
    data: { body, editedAt: new Date() },
    select: messageFullSelect,
  });
  return NextResponse.json({ message: serializeMessage(updatedMessage, updatedMessage.sender) });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceId, messageId } = parseBody(await readJson(request));

  if (!workspaceId || !messageId) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const [membership, message] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.message.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        channel: {
          workspaceId,
        },
      },
      select: {
        id: true,
        senderUserId: true,
      },
    }),
  ]);

  const canModerate = membership?.role === "OWNER" || membership?.role === "ADMIN";

  if (membership?.status !== "ACTIVE" || !message || (message.senderUserId !== currentUser.id && !canModerate)) {
    return NextResponse.json({ error: "You do not have permission to delete this message." }, { status: 403 });
  }

  const deletedMessage = await prisma.message.update({
    where: {
      id: message.id,
    },
    data: {
      deletedAt: new Date(),
    },
    select: messageFullSelect,
  });

  return NextResponse.json({ message: serializeMessage(deletedMessage, deletedMessage.sender) });
}

// Full select used by PATCH / DELETE (combines scalars + relations in one select)
const messageFullSelect = chatMessageFullSelect;

function serializeMessage(
  message: {
    id: string; channelId: string; senderUserId: string; body: string;
    createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
    isPinned: boolean; replyToId: string | null;
    replyTo: { id: string; body: string; sender: { displayName: string } } | null;
    reactions: { emoji: string; userId: string }[];
    attachmentFile: { id: string; name: string; mimeType: string; sizeBytes: number | null; publicUrl: string | null } | null;
  },
  sender: { displayName: string; avatarUrl: string | null },
) {
  const reactionMap = new Map<string, string[]>();
  for (const r of message.reactions) {
    const arr = reactionMap.get(r.emoji) ?? [];
    arr.push(r.userId);
    reactionMap.set(r.emoji, arr);
  }
  return {
    id: message.id,
    channelId: message.channelId,
    senderUserId: message.senderUserId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    isPinned: message.isPinned,
    replyToId: message.replyToId,
    replyTo: message.replyTo ?? null,
    reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({ emoji, userIds })),
    attachmentFile: message.attachmentFile ?? null,
    sender,
  };
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      workspaceId: "",
      channelId: "",
      messageId: "",
      body: "",
    };
  }

  const maybeBody = body as {
    workspaceId?: unknown; channelId?: unknown; messageId?: unknown;
    body?: unknown; replyToId?: unknown; attachmentFileId?: unknown; pin?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    channelId: typeof maybeBody.channelId === "string" ? maybeBody.channelId : "",
    messageId: typeof maybeBody.messageId === "string" ? maybeBody.messageId : "",
    body: typeof maybeBody.body === "string" ? maybeBody.body.trim() : "",
    replyToId: typeof maybeBody.replyToId === "string" ? maybeBody.replyToId : null,
    attachmentFileId: typeof maybeBody.attachmentFileId === "string" ? maybeBody.attachmentFileId : null,
    pin: typeof maybeBody.pin === "boolean" ? maybeBody.pin : null,
  };
}
