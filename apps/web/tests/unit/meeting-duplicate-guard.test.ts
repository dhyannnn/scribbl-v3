import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMeeting, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getSupabaseAuthUser: vi.fn(),
}));

vi.mock("@/lib/email/meeting-notifications", () => ({
  sendMeetingScheduledEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendMeetingCanceledEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/livekit-room", () => ({
  createLiveKitMeetingRoomName: vi.fn(() => "room-name"),
}));

vi.mock("@/lib/app-url", () => ({
  createAppUrl: vi.fn(async (path: string) => `http://localhost:3000${path}`),
}));

vi.mock("@/lib/meeting-lifecycle", () => ({
  getMeetingLifecycle: vi.fn(() => "upcoming"),
  canManageMeetingSchedule: vi.fn(() => true),
}));

const { scheduleMeeting } = await import("@/app/workspaces/[id]/meetings/actions");

describe("scheduleMeeting duplicate guard", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);

  const startsAtDate = new Date(Date.now() + 60 * 60 * 1000);
  const startsAt = startsAtDate.toISOString().slice(0, 16);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.workspace.findUnique.mockResolvedValue({
      ...workspace,
      members: [{ userId: user.id, user: { email: user.email } }],
    } as never);
  });

  it("blocks non-members from scheduling meetings", async () => {
    const outsider = makeUser();
    mockGetCurrentUser.mockResolvedValue(outsider);
    prismaMock.workspace.findUnique.mockResolvedValue({
      ...workspace,
      members: [{ userId: user.id, user: { email: user.email } }],
    } as never);

    const fd = makeFormData({
      workspaceId: workspace.id,
      title: "Standup",
      startsAt,
      userTimezone: "UTC",
      durationMinutes: "60",
    });
    const url = await captureRedirect(() => scheduleMeeting(fd));

    expect(url).toContain("unauthorized");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns without creating a duplicate meeting", async () => {
    const duplicate = makeMeeting(workspace.id, user.id, { title: "Standup", startsAt: startsAtDate });
    prismaMock.meeting.findFirst.mockResolvedValue(duplicate);

    const fd = makeFormData({
      workspaceId: workspace.id,
      title: "Standup",
      startsAt,
      userTimezone: "UTC",
      durationMinutes: "60",
    });
    const url = await captureRedirect(() => scheduleMeeting(fd));

    expect(url).toContain("meeting=scheduled");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("creates a meeting when no duplicate exists", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(null);
    const newMeeting = makeMeeting(workspace.id, user.id);
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        prismaMock.meeting.create.mockResolvedValue(newMeeting as never);
        prismaMock.meeting.update.mockResolvedValue(newMeeting as never);
        prismaMock.channel.create.mockResolvedValue({ id: "channel-id" } as never);
        await fn(prismaMock);
      }
    });

    const fd = makeFormData({
      workspaceId: workspace.id,
      title: "New Meeting",
      startsAt,
      userTimezone: "UTC",
      durationMinutes: "60",
    });
    const url = await captureRedirect(() => scheduleMeeting(fd));

    // Success redirect goes to meetings list with ?meeting=scheduled
    expect(url).toContain(`/workspaces/${workspace.id}/meetings?meeting=scheduled`);
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});
