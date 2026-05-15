import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  createWorkspaceNotifications,
  notificationPreferenceDefaults,
} = await import("@/lib/notifications");

// ── Defaults ──────────────────────────────────────────────────────────────────

describe("notification preference defaults", () => {
  it("has announcements on, chatMessages off, and the rest on", () => {
    expect(notificationPreferenceDefaults.announcements).toBe(true);
    expect(notificationPreferenceDefaults.chatMessages).toBe(false);
    expect(notificationPreferenceDefaults.meetings).toBe(true);
    expect(notificationPreferenceDefaults.files).toBe(true);
    expect(notificationPreferenceDefaults.notes).toBe(true);
  });
});

// ── Actor exclusion ───────────────────────────────────────────────────────────
// createWorkspaceNotifications excludes the actor at the DB-query level
// (WHERE userId != actorUserId). The test mocks only reflect the filtered
// result — i.e. actor never appears in the findMany return value.

describe("createWorkspaceNotifications — actor exclusion", () => {
  it("queries workspace members excluding the actor by userId", async () => {
    const actor = makeUser();
    const workspace = makeWorkspace(actor.id);

    // DB filters actor out → findMany returns empty
    prismaMock.workspaceMember.findMany.mockResolvedValue([]);

    await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "A new announcement",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "announcements",
      title: "Announcement posted",
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: workspace.id,
    });

    expect(prismaMock.workspaceMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: actor.id },
        }),
      }),
    );
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it("notifies only recipients — not the actor — when there are multiple members", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    // DB has already excluded actor; only recipient comes back
    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: recipient.id, user: { notificationPreference: null } },
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
    const callData = prismaMock.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(callData).toHaveLength(1);
    expect(callData[0].userId).toBe(recipient.id);
    expect(callData.some((n) => n.userId === actor.id)).toBe(false);
  });
});

// ── Multiple recipients ───────────────────────────────────────────────────────

describe("createWorkspaceNotifications — multiple recipients", () => {
  it("creates a notification for each eligible recipient", async () => {
    const actor = makeUser();
    const r1 = makeUser();
    const r2 = makeUser();
    const r3 = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: r1.id, user: { notificationPreference: null } },
      { userId: r2.id, user: { notificationPreference: null } },
      { userId: r3.id, user: { notificationPreference: null } },
    ] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 3 });

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Meeting rescheduled",
      href: `/workspaces/${workspace.id}/meetings/123`,
      preference: "meetings",
      title: "Meeting updated",
      type: "MEETING_UPDATED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(3);
    const callData = prismaMock.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(callData).toHaveLength(3);
    expect(callData.map((n) => n.userId).sort()).toEqual([r1.id, r2.id, r3.id].sort());
  });

  it("skips recipients who explicitly disabled the preference", async () => {
    const actor = makeUser();
    const optedIn = makeUser();
    const optedOut = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: optedIn.id, user: { notificationPreference: { meetings: true } } },
      { userId: optedOut.id, user: { notificationPreference: { meetings: false } } },
    ] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Meeting scheduled",
      href: `/workspaces/${workspace.id}/meetings/123`,
      preference: "meetings",
      title: "Meeting scheduled",
      type: "MEETING_SCHEDULED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(1);
    const callData = prismaMock.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(callData).toHaveLength(1);
    expect(callData[0].userId).toBe(optedIn.id);
  });

  it("sends nothing when workspace has no members besides the actor", async () => {
    const actor = makeUser();
    const workspace = makeWorkspace(actor.id);

    // DB already excluded actor, no other members
    prismaMock.workspaceMember.findMany.mockResolvedValue([]);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Meeting scheduled",
      href: `/workspaces/${workspace.id}/meetings/123`,
      preference: "meetings",
      title: "Meeting scheduled",
      type: "MEETING_SCHEDULED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

// ── Chat notification defaults ────────────────────────────────────────────────

describe("createWorkspaceNotifications — chat messages", () => {
  it("does not fire chat notifications by default (chatMessages is off)", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: recipient.id, user: { notificationPreference: null } },
    ] as never);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Hey everyone",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "chatMessages",
      title: "New chat message",
      type: "CHAT_MESSAGE",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });

  it("fires chat notifications only for recipients who explicitly opted in", async () => {
    const actor = makeUser();
    const optedIn = makeUser();
    const defaultUser = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: optedIn.id, user: { notificationPreference: { chatMessages: true } } },
      { userId: defaultUser.id, user: { notificationPreference: null } },
    ] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Hey everyone",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "chatMessages",
      title: "New chat message",
      type: "CHAT_MESSAGE",
      workspaceId: workspace.id,
    });

    expect(count).toBe(1);
    const callData = prismaMock.notification.createMany.mock.calls[0][0].data as { userId: string }[];
    expect(callData).toHaveLength(1);
    expect(callData[0].userId).toBe(optedIn.id);
  });

  it("sends to no one when no recipient has opted in to chat notifications", async () => {
    const actor = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: makeUser().id, user: { notificationPreference: { chatMessages: false } } },
      { userId: makeUser().id, user: { notificationPreference: null } },
    ] as never);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Hey",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "chatMessages",
      title: "Chat",
      type: "CHAT_MESSAGE",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});

// ── Announcement notifications ────────────────────────────────────────────────

describe("createWorkspaceNotifications — announcements", () => {
  it("includes all required metadata in each notification record", async () => {
    const actor = makeUser();
    const recipient = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: recipient.id, user: { notificationPreference: null } },
    ] as never);
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 });

    await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Welcome to the course!",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "announcements",
      title: "New announcement",
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: workspace.id,
    });

    expect(prismaMock.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: recipient.id,
          actorUserId: actor.id,
          workspaceId: workspace.id,
          type: "ANNOUNCEMENT_POSTED",
          title: "New announcement",
          body: "Welcome to the course!",
          href: `/workspaces/${workspace.id}/chat`,
        }),
      ],
    });
  });

  it("skips recipients who explicitly disabled announcements", async () => {
    const actor = makeUser();
    const workspace = makeWorkspace(actor.id);

    prismaMock.workspaceMember.findMany.mockResolvedValue([
      { userId: makeUser().id, user: { notificationPreference: { announcements: false } } },
    ] as never);

    const count = await createWorkspaceNotifications({
      actorUserId: actor.id,
      body: "Announcement!",
      href: `/workspaces/${workspace.id}/chat`,
      preference: "announcements",
      title: "Announcement",
      type: "ANNOUNCEMENT_POSTED",
      workspaceId: workspace.id,
    });

    expect(count).toBe(0);
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled();
  });
});
