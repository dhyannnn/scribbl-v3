import "server-only";

import { logger } from "@/lib/logger";
import { createWorkspaceNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";

export const maxChatMessageLength = 2000;

export type ChatWriteUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatMessageWriteResult =
  | {
      ok: true;
      message: ChatMessageRecord;
      notification: ChatMessageNotificationInput;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export type ChatMessageRecord = {
  id: string;
  channelId: string;
  senderUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  isPinned: boolean;
  replyToId: string | null;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  replyTo: { id: string; body: string; sender: { displayName: string } } | null;
  reactions: { emoji: string; userId: string }[];
  attachmentFile: { id: string; name: string; mimeType: string; sizeBytes: number | null; publicUrl: string | null } | null;
};

type ChatMessageNotificationInput = {
  body: string;
  workspaceId: string;
  channelId: string;
  channelName: string;
  channelType: "CHAT" | "ANNOUNCEMENT" | "DIRECT";
  actorUserId: string;
  actorDisplayName: string;
  directRecipientUserId: string | null;
};

export async function createChatMessage({
  user,
  workspaceId,
  channelId,
  body,
  replyToId,
  attachmentFileId,
}: {
  user: ChatWriteUser;
  workspaceId?: string;
  channelId: string;
  body: string;
  replyToId?: string | null;
  attachmentFileId?: string | null;
}): Promise<ChatMessageWriteResult> {
  const cleanBody = body.trim();

  if (!channelId || !cleanBody) {
    return { ok: false, status: 400, error: "Message is required." };
  }

  if (cleanBody.length > maxChatMessageLength) {
    return { ok: false, status: 400, error: "Message is too long." };
  }

  if (!RateLimits.chatSend(user.id)) {
    return { ok: false, status: 429, error: "Too many messages. Slow down." };
  }

  const channel = await getWritableChannel({
    channelId,
    userId: user.id,
    workspaceId,
  });

  if (!channel) {
    return { ok: false, status: 403, error: "You do not have permission to send messages here." };
  }

  if (channel.type === "ANNOUNCEMENT" && !canPostAnnouncement(channel.workspace.members[0]?.role)) {
    return { ok: false, status: 403, error: "Only workspace admins can post announcements." };
  }

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      senderUserId: user.id,
      body: cleanBody,
      ...(replyToId ? { replyToId } : {}),
      ...(attachmentFileId ? { attachmentFileId } : {}),
    },
    select: chatMessageFullSelect,
  });

  return {
    ok: true,
    message,
    notification: {
      body: cleanBody,
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      actorUserId: user.id,
      actorDisplayName: user.displayName,
      directRecipientUserId: channel.type === "DIRECT"
        ? channel.dmUser1Id === user.id ? channel.dmUser2Id : channel.dmUser1Id
        : null,
    },
  };
}

export async function createChatMessageNotifications(input: ChatMessageNotificationInput) {
  if (input.channelType === "ANNOUNCEMENT") {
    await createWorkspaceNotifications({
      actorUserId: input.actorUserId,
      body: input.body,
      href: `/workspaces/${input.workspaceId}/chat?channel=${input.channelId}`,
      preference: "announcements",
      title: `${input.actorDisplayName} posted an announcement`,
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: input.workspaceId,
    });
    return;
  }

  if (input.channelType === "DIRECT") {
    if (!input.directRecipientUserId) return;

    await createDmNotification({
      actorUserId: input.actorUserId,
      actorDisplayName: input.actorDisplayName,
      recipientUserId: input.directRecipientUserId,
      body: input.body,
      href: `/workspaces/${input.workspaceId}/chat/${input.channelId}`,
      workspaceId: input.workspaceId,
    });
    return;
  }

  await Promise.all([
    createWorkspaceNotifications({
      actorUserId: input.actorUserId,
      body: input.body,
      href: `/workspaces/${input.workspaceId}/chat/${input.channelId}`,
      preference: "chatMessages",
      title: `${input.actorDisplayName} posted in #${input.channelName}`,
      type: "CHAT_MESSAGE",
      workspaceId: input.workspaceId,
    }),
    createMentionNotifications(input),
  ]);
}

export function logChatNotificationFailure(context: { workspaceId: string; channelId: string }, error: unknown) {
  logger.error("Chat notifications could not be created", context, error);
}

export const chatMessageFullSelect = {
  id: true,
  channelId: true,
  senderUserId: true,
  body: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  isPinned: true,
  replyToId: true,
  sender: { select: { id: true, displayName: true, avatarUrl: true } },
  replyTo: { select: { id: true, body: true, sender: { select: { displayName: true } } } },
  reactions: { select: { emoji: true, userId: true } },
  attachmentFile: { select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true } },
} as const;

async function getWritableChannel({
  channelId,
  userId,
  workspaceId,
}: {
  channelId: string;
  userId: string;
  workspaceId?: string;
}) {
  return prisma.channel.findFirst({
    where: {
      id: channelId,
      ...(workspaceId ? { workspaceId } : {}),
      workspace: {
        members: { some: { userId, status: "ACTIVE" } },
      },
      OR: [
        { type: { not: "DIRECT" } },
        { dmUser1Id: userId },
        { dmUser2Id: userId },
      ],
    },
    select: {
      id: true,
      name: true,
      type: true,
      workspaceId: true,
      dmUser1Id: true,
      dmUser2Id: true,
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

function extractMentionedNames(body: string): string[] {
  const re = /@((?:\w+\s?){1,4})/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    names.add(match[1].trim().toLowerCase());
  }
  return [...names];
}

async function createDmNotification({
  actorUserId,
  actorDisplayName,
  recipientUserId,
  body,
  href,
  workspaceId,
}: {
  actorUserId: string;
  actorDisplayName: string;
  recipientUserId: string;
  body: string;
  href: string;
  workspaceId: string;
}) {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId: recipientUserId },
    select: { chatMessages: true },
  });

  if (!(pref?.chatMessages ?? false)) return;

  const preview = body.length > 80 ? `${body.slice(0, 80)}...` : body;

  await prisma.notification.create({
    data: {
      userId: recipientUserId,
      workspaceId,
      actorUserId,
      type: "CHAT_MESSAGE",
      title: `Message from ${actorDisplayName}`,
      body: preview,
      href,
    },
  });
}

async function createMentionNotifications({
  body,
  workspaceId,
  channelId,
  channelName,
  actorUserId,
  actorDisplayName,
}: ChatMessageNotificationInput) {
  const mentionedNames = extractMentionedNames(body);
  if (mentionedNames.length === 0) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: "ACTIVE", userId: { not: actorUserId } },
    select: { userId: true, user: { select: { displayName: true, deletedAt: true } } },
  });

  const mentionedUserIds = members
    .filter((member) => {
      if (member.user.deletedAt) return false;
      const name = member.user.displayName.toLowerCase();
      return mentionedNames.some((mention) => name.startsWith(mention) || name === mention);
    })
    .map((member) => member.userId);

  if (mentionedUserIds.length === 0) return;

  const preview = body.length > 80 ? `${body.slice(0, 80)}...` : body;

  await prisma.notification.createMany({
    data: mentionedUserIds.map((userId) => ({
      userId,
      workspaceId,
      actorUserId,
      type: "CHAT_MESSAGE" as const,
      title: `${actorDisplayName} mentioned you in #${channelName}`,
      body: preview,
      href: `/workspaces/${workspaceId}/chat/${channelId}`,
    })),
    skipDuplicates: true,
  });
}
