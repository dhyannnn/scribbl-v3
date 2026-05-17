import "server-only";

import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const readNotificationRetentionDays = 90;
const maxReadNotificationsPerUser = 500;

export type NotificationPreferenceKey = "announcements" | "chatMessages" | "meetings" | "files" | "notes";

export const notificationPreferenceDefaults: Record<NotificationPreferenceKey, boolean> = {
  announcements: true,
  chatMessages: false,
  meetings: true,
  files: true,
  notes: true,
};

type CreateWorkspaceNotificationsInput = {
  actorUserId: string;
  body?: string | null;
  groupId?: string | null;
  href: string;
  preference: NotificationPreferenceKey;
  title: string;
  type: NotificationType;
  workspaceId: string;
};

export async function createWorkspaceNotifications({
  actorUserId,
  body,
  groupId,
  href,
  preference,
  title,
  type,
  workspaceId,
}: CreateWorkspaceNotificationsInput) {
  const recipients = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: "ACTIVE",
      userId: {
        not: actorUserId,
      },
      user: {
        deletedAt: null,
        // When a meeting is scoped to a group, only notify members of that group
        ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          notificationPreference: {
            select: {
              [preference]: true,
            },
          },
        },
      },
    },
  });

  const enabledRecipientIds = recipients
    .filter((recipient) => recipient.user.notificationPreference?.[preference] ?? notificationPreferenceDefaults[preference])
    .map((recipient) => recipient.userId);

  if (enabledRecipientIds.length === 0) {
    return 0;
  }

  const { count } = await prisma.notification.createMany({
    data: enabledRecipientIds.map((userId) => ({
      userId,
      workspaceId,
      actorUserId,
      type,
      title,
      body,
      href,
    })),
  });

  return count;
}

export async function ensureNotificationPreference(userId: string) {
  return prisma.notificationPreference.upsert({
    where: {
      userId,
    },
    update: {},
    create: {
      userId,
      ...notificationPreferenceDefaults,
    },
  });
}

export async function cleanupUserNotifications(userId: string) {
  const retentionCutoff = new Date(Date.now() - readNotificationRetentionDays * 24 * 60 * 60 * 1000);

  const oldReadResult = await prisma.notification.deleteMany({
    where: {
      userId,
      readAt: {
        lt: retentionCutoff,
      },
    },
  });

  const excessReadNotifications = await prisma.notification.findMany({
    where: {
      userId,
      readAt: {
        not: null,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: maxReadNotificationsPerUser,
  });

  if (excessReadNotifications.length === 0) {
    return oldReadResult.count;
  }

  const excessReadResult = await prisma.notification.deleteMany({
    where: {
      userId,
      id: {
        in: excessReadNotifications.map((notification) => notification.id),
      },
    },
  });

  return oldReadResult.count + excessReadResult.count;
}
