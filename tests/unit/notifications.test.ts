import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  cleanupUserNotifications,
  createWorkspaceNotifications,
  ensureNotificationPreference,
  notificationPreferenceDefaults,
} = await import("@/lib/notifications");

describe("createWorkspaceNotifications", () => {
  it("creates announcement notifications for recipients without explicit preferences", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      {
        userId: recipient.id,
        user: {
          notificationPreference: null,
        },
      },
    ] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "A new announcement",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "announcements",
      title: "Announcement posted",
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(1);
    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: recipient.id,
          workspaceId: workspace.id,
          actorUserId: actor.id,
          type: "ANNOUNCEMENT_POSTED",
        }),
      ],
    });
  });

  it("keeps chat message notifications off by default", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      {
        userId: recipient.id,
        user: {
          notificationPreference: null,
        },
      },
    ] as never);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "A chat message",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "chatMessages",
      title: "New chat message",
      type: "CHAT_MESSAGE",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it("honors explicit disabled preferences", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      {
        userId: recipient.id,
        user: {
          notificationPreference: {
            announcements: false,
          },
        },
      },
    ] as never);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "A new announcement",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "announcements",
      title: "Announcement posted",
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("ensureNotificationPreference", () => {
  it("creates preferences with the shared defaults", async () => {
    const user = makeUser();
    prismaMock.notificationPreference.upsert.mockResolvedValue({
      id: "pref-id",
      userId: user.id,
      ...notificationPreferenceDefaults,
      soundEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ensureNotificationPreference(user.id);

    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId: user.id,
      },
      update: {},
      create: {
        userId: user.id,
        ...notificationPreferenceDefaults,
      },
    });
  });
});

describe("cleanupUserNotifications", () => {
  it("removes old read notifications and excess read notifications", async () => {
    const user = makeUser();
    prismaMock.notification.deleteMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 3 });
    prismaMock.notification.findMany.mockResolvedValue([
      { id: "old-read-1" },
      { id: "old-read-2" },
      { id: "old-read-3" },
    ] as never);

    const count = await cleanupUserNotifications(user.id);

    expect(count).toBe(5);
    expect(prismaMock.notification.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        userId: user.id,
        readAt: {
          lt: expect.any(Date),
        },
      },
    });
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
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
      skip: 500,
    });
    expect(prismaMock.notification.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: user.id,
        id: {
          in: ["old-read-1", "old-read-2", "old-read-3"],
        },
      },
    });
  });

  it("does not delete unread notifications during cleanup", async () => {
    const user = makeUser();
    prismaMock.notification.deleteMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.notification.findMany.mockResolvedValue([]);

    const count = await cleanupUserNotifications(user.id);

    expect(count).toBe(0);
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        readAt: {
          lt: expect.any(Date),
        },
      },
    });
  });
});
