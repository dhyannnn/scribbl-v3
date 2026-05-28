import { NextResponse } from "next/server";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { createWorkspaceNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";

const maxMessageLength = 2000;

export async function POST(request: Request) {
  const startedAt = performance.now();
  const currentUser = await getCurrentUser();
  const userResolvedAt = performance.now();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!RateLimits.chatSend(currentUser.id)) {
    return NextResponse.json({ error: "Too many messages. Slow down." }, { status: 429 });
  }

  const { workspaceId, channelId, body, replyToId } = parseBody(await readJson(request));

  if (!workspaceId || !channelId || !body) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (body.length > maxMessageLength) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const channel = await getAccessibleChannel(workspaceId, channelId, currentUser.id);
  const accessCheckedAt = performance.now();

  if (!channel) {
    return NextResponse.json({ error: "You do not have permission to send messages here." }, { status: 403 });
  }

  if (channel.type === "ANNOUNCEMENT" && !canPostAnnouncement(channel.workspace.members[0]?.role)) {
    return NextResponse.json({ error: "Only workspace admins can post announcements." }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      senderUserId: currentUser.id,
      body,
      ...(replyToId ? { replyToId } : {}),
    },
    select: messageFullSelect,
  });
  const messageCreatedAt = performance.now();
  logChatTiming("create", startedAt, userResolvedAt, accessCheckedAt, messageCreatedAt);

  if (channel.type === "ANNOUNCEMENT") {
    after(() => {
      void createWorkspaceNotifications({
        actorUserId: currentUser.id,
        body,
        href: `/workspaces/${workspaceId}/chat?channel=${channel.id}`,
        preference: "announcements",
        title: `${currentUser.displayName} posted an announcement`,
        type: "ANNOUNCEMENT_POSTED",
        workspaceId,
      }).catch((error) => {
        logger.error("Announcement notifications could not be created", { workspaceId, channelId }, error);
      });
    });
  } else {
    after(() => {
      void Promise.all([
        // General chat notification (respects per-user chatMessages preference)
        createWorkspaceNotifications({
          actorUserId: currentUser.id,
          body,
          href: `/workspaces/${workspaceId}/chat/${channelId}`,
          preference: "chatMessages",
          title: `${currentUser.displayName} posted in #${channel.name}`,
          type: "CHAT_MESSAGE",
          workspaceId,
        }),
        // @mention notifications — always delivered, bypass chatMessages preference
        createMentionNotifications({
          body,
          workspaceId,
          channelId,
          channelName: channel.name,
          actorUserId: currentUser.id,
          actorDisplayName: currentUser.displayName,
        }),
      ]).catch((error) => {
        logger.error("Chat notifications could not be created", { workspaceId, channelId }, error);
      });
    });
  }

  return NextResponse.json({
    message: serializeMessage(message, {
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

async function getAccessibleChannel(workspaceId: string, channelId: string, userId: string) {
  return prisma.channel.findFirst({
    where: {
      id: channelId,
      workspaceId,
      workspace: {
        members: {
          some: {
            userId,
            status: "ACTIVE",
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      type: true,
      workspace: {
        select: {
          members: {
            where: {
              userId,
              status: "ACTIVE",
            },
            select: {
              role: true,
            },
            take: 1,
          },
        },
      },
    },
  });
}

function canPostAnnouncement(role?: string) {
  return role === "OWNER" || role === "ADMIN";
}

// Full select used by PATCH / DELETE (combines scalars + relations in one select)
const messageFullSelect = {
  id: true, channelId: true, senderUserId: true, body: true,
  createdAt: true, editedAt: true, deletedAt: true, isPinned: true, replyToId: true,
  sender: { select: { displayName: true, avatarUrl: true } },
  replyTo: { select: { id: true, body: true, sender: { select: { displayName: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  attachmentFile: { select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true } },
} as const;

const messageSelect = {
  id: true,
  channelId: true,
  senderUserId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  isPinned: true,
  replyToId: true,
  replyTo: {
    select: {
      id: true,
      body: true,
      sender: { select: { displayName: true } },
    },
  },
  reactions: { select: { emoji: true, userId: true } },
  attachmentFile: {
    select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true },
  },
} as const;

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
    body?: unknown; replyToId?: unknown; pin?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    channelId: typeof maybeBody.channelId === "string" ? maybeBody.channelId : "",
    messageId: typeof maybeBody.messageId === "string" ? maybeBody.messageId : "",
    body: typeof maybeBody.body === "string" ? maybeBody.body.trim() : "",
    replyToId: typeof maybeBody.replyToId === "string" ? maybeBody.replyToId : null,
    pin: typeof maybeBody.pin === "boolean" ? maybeBody.pin : null,
  };
}


// ── @mention notifications ────────────────────────────────────────────────────

function extractMentionedNames(body: string): string[] {
  const re = /@((?:\w+\s?){1,4})/g;
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    names.add(m[1].trim().toLowerCase());
  }
  return [...names];
}

async function createMentionNotifications({
  body, workspaceId, channelId, channelName, actorUserId, actorDisplayName,
}: {
  body: string; workspaceId: string; channelId: string; channelName: string;
  actorUserId: string; actorDisplayName: string;
}) {
  const mentionedNames = extractMentionedNames(body);
  if (mentionedNames.length === 0) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: "ACTIVE", userId: { not: actorUserId } },
    select: { userId: true, user: { select: { displayName: true, deletedAt: true } } },
  });

  const mentionedUserIds = members
    .filter((m) => {
      if (m.user.deletedAt) return false;
      const name = m.user.displayName.toLowerCase();
      return mentionedNames.some((mention) => name.startsWith(mention) || name === mention);
    })
    .map((m) => m.userId);

  if (mentionedUserIds.length === 0) return;

  const href = `/workspaces/${workspaceId}/chat/${channelId}`;
  const preview = body.length > 80 ? body.slice(0, 80) + "…" : body;

  await prisma.notification.createMany({
    data: mentionedUserIds.map((userId) => ({
      userId,
      workspaceId,
      actorUserId,
      type: "CHAT_MESSAGE" as const,
      title: `${actorDisplayName} mentioned you in #${channelName}`,
      body: preview,
      href,
    })),
    skipDuplicates: true,
  });
}
