import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeMeeting, makeFormData } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// Mock LiveKit admin so we don't need a real LiveKit connection in tests that
// trigger enforceParticipantVideoPermission for video-target overrides.
vi.mock("@/lib/livekit-admin", () => ({
  enforceLiveKitVideoPermissions: vi.fn().mockResolvedValue(undefined),
  toLiveKitParticipantPermission: vi.fn().mockReturnValue({}),
}));

const { requestMeetingPermission, setMeetingPermissionOverride } = await import(
  "@/app/workspaces/[id]/meetings/[meetingId]/actions"
);

// ─────────────────────────────────────────────────────────────────────────────
// requestMeetingPermission
// ─────────────────────────────────────────────────────────────────────────────

describe("requestMeetingPermission", () => {
  const tutor = makeUser();
  const student = makeUser();
  const workspace = makeWorkspace(tutor.id);
  const meeting = makeMeeting(workspace.id, tutor.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(student);
  });

  it("does nothing when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "SHARED_NOTES" }),
    );

    expect(prismaMock.meetingPermissionOverride.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
  });

  it("does nothing when targetType is invalid", async () => {
    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "INVALID_TYPE" }),
    );

    expect(prismaMock.meeting.findFirst).not.toHaveBeenCalled();
  });

  it("does nothing when the meeting does not exist", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(null);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id),
    );

    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "SHARED_NOTES" }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
  });

  it("does nothing when the requesting user is not an active member", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({ id: meeting.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "SHARED_NOTES" }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
  });

  it("creates a REQUESTED override for a valid active member", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({ id: meeting.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id),
    );
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(null);
    prismaMock.meetingPermissionOverride.create.mockResolvedValue({} as never);

    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "SHARED_NOTES" }),
    );

    expect(prismaMock.meetingPermissionOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meetingId: meeting.id,
          userId: student.id,
          targetType: "SHARED_NOTES",
          state: "REQUESTED",
        }),
      }),
    );
  });

  it("creates a REQUESTED override scoped to a specific artifact", async () => {
    const artifactId = "00000000-0000-0000-0000-000000000101";
    prismaMock.meeting.findFirst.mockResolvedValue({ id: meeting.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id),
    );
    prismaMock.meetingArtifact.findFirst.mockResolvedValue({ id: artifactId } as never);
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(null);
    prismaMock.meetingPermissionOverride.create.mockResolvedValue({} as never);

    await requestMeetingPermission(
      makeFormData({ workspaceId: workspace.id, meetingId: meeting.id, targetType: "WHITEBOARD", artifactId }),
    );

    expect(prismaMock.meetingPermissionOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: "WHITEBOARD",
          artifactId,
          state: "REQUESTED",
        }),
      }),
    );
  });

  it("does nothing when an artifact-scoped request refers to a non-existent artifact", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({ id: meeting.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id),
    );
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(null);

    await requestMeetingPermission(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        targetType: "WHITEBOARD",
        artifactId: "non-existent-id",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setMeetingPermissionOverride
// ─────────────────────────────────────────────────────────────────────────────

describe("setMeetingPermissionOverride", () => {
  const owner = makeUser();
  const student = makeUser();
  const workspace = makeWorkspace(owner.id);
  const meeting = makeMeeting(workspace.id, owner.id);

  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
  const studentMembership = makeMembership(workspace.id, student.id, { role: "MEMBER" });
  const studentParticipant = { id: "participant-1" };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
    expect(prismaMock.meetingPermissionOverride.update).not.toHaveBeenCalled();
  });

  it("does nothing when the state value is invalid", async () => {
    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "MAYBE",
      }),
    );

    expect(prismaMock.meeting.findFirst).not.toHaveBeenCalled();
  });

  it("blocks a non-moderator (MEMBER) from approving another participant", async () => {
    // Student tries to approve their own request — canManageMeetingParticipantPermissions
    // returns false for MEMBER targeting another user.
    const otherStudent = makeUser();
    mockGetCurrentUser.mockResolvedValue(student);

    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: owner.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(studentMembership) // current user membership
      .mockResolvedValueOnce(makeMembership(workspace.id, otherStudent.id, { role: "MEMBER" })); // target membership
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(studentParticipant as never);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: otherStudent.id,
        targetType: "SHARED_NOTES",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
    expect(prismaMock.meetingPermissionOverride.update).not.toHaveBeenCalled();
  });

  it("allows a workspace OWNER to grant ALLOWED state", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: owner.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(studentMembership);
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(studentParticipant as never);
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(null);
    prismaMock.meetingPermissionOverride.create.mockResolvedValue({} as never);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: student.id,
          targetType: "SHARED_NOTES",
          state: "ALLOWED",
          grantedByUserId: owner.id,
        }),
      }),
    );
  });

  it("allows a workspace OWNER to deny (DENIED state)", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: owner.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(studentMembership);
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(studentParticipant as never);
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(null);
    prismaMock.meetingPermissionOverride.create.mockResolvedValue({} as never);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "DENIED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: "DENIED",
          grantedByUserId: owner.id,
        }),
      }),
    );
  });

  it("updates an existing override rather than creating a duplicate", async () => {
    const existingOverride = {
      id: "override-1",
      meetingId: meeting.id,
      userId: student.id,
      targetType: "SHARED_NOTES",
      artifactId: null,
      state: "REQUESTED",
      grantedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: owner.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(studentMembership);
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(studentParticipant as never);
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(existingOverride as never);
    prismaMock.meetingPermissionOverride.update.mockResolvedValue({} as never);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: existingOverride.id }),
        data: expect.objectContaining({ state: "ALLOWED", grantedByUserId: owner.id }),
      }),
    );
    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
  });

  it("does nothing when the target participant has not joined the meeting", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: owner.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(studentMembership);
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(null); // not a participant

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "SHARED_NOTES",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).not.toHaveBeenCalled();
    expect(prismaMock.meetingPermissionOverride.update).not.toHaveBeenCalled();
  });

  it("allows an ADMIN role to approve a member's whiteboard request", async () => {
    const tutor = makeUser();
    const tutorMembership = makeMembership(workspace.id, tutor.id, { role: "ADMIN" });
    mockGetCurrentUser.mockResolvedValue(tutor);

    prismaMock.meeting.findFirst.mockResolvedValue({
      id: meeting.id,
      createdByUserId: tutor.id,
      moderationSettings: null,
    } as never);
    prismaMock.workspaceMember.findUnique
      .mockResolvedValueOnce(tutorMembership)
      .mockResolvedValueOnce(studentMembership);
    prismaMock.meetingParticipant.findFirst.mockResolvedValue(studentParticipant as never);
    prismaMock.meetingPermissionOverride.findFirst.mockResolvedValue(null);
    prismaMock.meetingPermissionOverride.create.mockResolvedValue({} as never);

    await setMeetingPermissionOverride(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: meeting.id,
        userId: student.id,
        targetType: "WHITEBOARD",
        state: "ALLOWED",
      }),
    );

    expect(prismaMock.meetingPermissionOverride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: "WHITEBOARD",
          state: "ALLOWED",
          grantedByUserId: tutor.id,
        }),
      }),
    );
  });
});
