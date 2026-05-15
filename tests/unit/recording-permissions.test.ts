import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeMeeting, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/livekit-admin", () => ({
  enforceLiveKitVideoPermissions: vi.fn().mockResolvedValue(undefined),
  toLiveKitParticipantPermission: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/meeting-recording", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meeting-recording")>();
  return {
    ...actual,
    startRoomRecording: vi.fn().mockResolvedValue({
      info: { egressId: "egress-1", error: null, status: 1 },
      storageBucket: "recordings",
    }),
    stopRoomRecording: vi.fn().mockResolvedValue(undefined),
  };
});

const { startMeetingRecording } = await import(
  "@/app/workspaces/[id]/meetings/[meetingId]/actions"
);

// ─────────────────────────────────────────────────────────────────────────────

describe("startMeetingRecording", () => {
  const owner = makeUser();
  const member = makeUser();
  const workspace = makeWorkspace(owner.id);
  const meeting = makeMeeting(workspace.id, owner.id, {
    startsAt: new Date(Date.now() - 30 * 60 * 1000), // started 30 min ago
    endsAt: new Date(Date.now() + 30 * 60 * 1000),   // ends 30 min from now
    canceledAt: null,
  });

  const liveMeetingRow = {
    id: meeting.id,
    title: meeting.title,
    createdByUserId: owner.id,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    canceledAt: null,
    videoSessions: [{ id: "session-1" }], // active participant present
  };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("redirects to login when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const url = await captureRedirect(() =>
      startMeetingRecording(
        makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
      ),
    );

    expect(url).toMatch(/\/login/);
  });

  it("does not start recording when the user is not an active member", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(liveMeetingRow as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("blocks a MEMBER (non-admin, non-creator) from starting recording", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.meeting.findFirst.mockResolvedValue(liveMeetingRow as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { role: "MEMBER" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("blocks recording when the meeting is not joinable (ended)", async () => {
    const endedMeeting = {
      ...liveMeetingRow,
      endsAt: new Date(Date.now() - 60 * 60 * 1000), // ended 1 hour ago
    };
    prismaMock.meeting.findFirst.mockResolvedValue(endedMeeting as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "OWNER" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("blocks recording when the meeting is canceled", async () => {
    const canceledMeeting = {
      ...liveMeetingRow,
      canceledAt: new Date(Date.now() - 10 * 60 * 1000),
    };
    prismaMock.meeting.findFirst.mockResolvedValue(canceledMeeting as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "OWNER" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("blocks recording when no active video participants are present", async () => {
    const emptyRoom = { ...liveMeetingRow, videoSessions: [] }; // nobody in the room
    prismaMock.meeting.findFirst.mockResolvedValue(emptyRoom as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "OWNER" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("blocks recording when a recording is already active", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(liveMeetingRow as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "OWNER" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue({ id: "existing-recording" } as never);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to start recording during a live meeting with participants", async () => {
    const admin = makeUser();
    mockGetCurrentUser.mockResolvedValue(admin);

    prismaMock.meeting.findFirst.mockResolvedValue(liveMeetingRow as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, admin.id, { role: "ADMIN" }),
    );
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);
    prismaMock.meetingRecording.create.mockResolvedValue({ id: "new-recording" } as never);

    await startMeetingRecording(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, recordingReturnTo: "current" }),
    );

    expect(prismaMock.meetingRecording.create).toHaveBeenCalled();
  });
});
