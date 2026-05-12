import { describe, expect, it } from "vitest";
import {
  canManageMeetingParticipantPermissions,
  canEditMeetingSharedNote,
  canEditMeetingWhiteboard,
  canRaiseHand,
  getMeetingVideoPermissions,
  resolveMeetingVideoPermission,
  type MeetingPermissionOverrideInput,
} from "@/lib/meeting-permissions";

describe("meeting video permissions", () => {
  const meetingCreatedByUserId = "dhyan";

  it("lets workspace owners force video permissions on meeting creators", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "dhyan",
        targetType: "CAMERA",
        artifactId: null,
        state: "DENIED",
      },
    ];

    expect(
      getMeetingVideoPermissions({
        currentUserId: "dhyan",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides,
      }).canUseCamera,
    ).toBe(false);
  });

  it("keeps workspace owners immune to participant video blocks", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "karuna",
        targetType: "CAMERA",
        artifactId: null,
        state: "DENIED",
      },
    ];

    expect(
      getMeetingVideoPermissions({
        currentUserId: "karuna",
        meetingCreatedByUserId,
        currentUserRole: "OWNER",
        overrides,
      }).canUseCamera,
    ).toBe(true);
  });

  it("applies default screen share blocks to meeting creators", () => {
    expect(
      getMeetingVideoPermissions({
        currentUserId: "dhyan",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides: [],
      }).canShareScreen,
    ).toBe(false);
  });

  it("allows meeting creators to share screen when explicitly allowed", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "dhyan",
        targetType: "SCREEN_SHARE",
        artifactId: null,
        state: "ALLOWED",
      },
    ];

    expect(
      getMeetingVideoPermissions({
        currentUserId: "dhyan",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides,
      }).canShareScreen,
    ).toBe(true);
  });
});

describe("meeting participant permission management", () => {
  it("allows an owner to manage the meeting creator", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "karuna",
        currentUserRole: "OWNER",
        meetingCreatedByUserId: "dhyan",
        targetUserId: "dhyan",
        targetUserRole: "MEMBER",
      }),
    ).toBe(true);
  });

  it("does not allow the meeting creator to manage the workspace owner", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "dhyan",
        currentUserRole: "MEMBER",
        meetingCreatedByUserId: "dhyan",
        targetUserId: "karuna",
        targetUserRole: "OWNER",
      }),
    ).toBe(false);
  });
});

describe("hand raise", () => {
  const meetingCreatedByUserId = "tutor";

  it("allows a student to raise their hand when handRaiseEnabled is true", () => {
    expect(
      canRaiseHand({
        currentUserId: "student",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        settings: { sharedNotesDefaultEdit: false, whiteboardDefaultEdit: false, micDefaultEnabled: true, cameraDefaultEnabled: true, screenShareDefaultEnabled: false, reactionsEnabled: true, handRaiseEnabled: true },
        overrides: [],
      }),
    ).toBe(true);
  });

  it("blocks a student from raising their hand when handRaiseEnabled is false", () => {
    expect(
      canRaiseHand({
        currentUserId: "student",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        settings: { sharedNotesDefaultEdit: false, whiteboardDefaultEdit: false, micDefaultEnabled: true, cameraDefaultEnabled: true, screenShareDefaultEnabled: false, reactionsEnabled: true, handRaiseEnabled: false },
        overrides: [],
      }),
    ).toBe(false);
  });

  it("allows a moderator to raise their hand even when handRaiseEnabled is false", () => {
    expect(
      canRaiseHand({
        currentUserId: "tutor",
        meetingCreatedByUserId,
        currentUserRole: "TUTOR",
        settings: { sharedNotesDefaultEdit: false, whiteboardDefaultEdit: false, micDefaultEnabled: true, cameraDefaultEnabled: true, screenShareDefaultEnabled: false, reactionsEnabled: true, handRaiseEnabled: false },
        overrides: [],
      }),
    ).toBe(true);
  });

  it("allows a moderator to lower a student's hand", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "tutor",
        currentUserRole: "TUTOR",
        meetingCreatedByUserId,
        targetUserId: "student",
        targetUserRole: "MEMBER",
      }),
    ).toBe(true);
  });

  it("does not allow a student to lower another student's hand", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "student-a",
        currentUserRole: "MEMBER",
        meetingCreatedByUserId,
        targetUserId: "student-b",
        targetUserRole: "MEMBER",
      }),
    ).toBe(false);
  });
});

describe("permission request (REQUESTED state)", () => {
  const meetingCreatedByUserId = "tutor";

  it("treats REQUESTED state as blocked for shared note writing", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "student",
        targetType: "SHARED_NOTES",
        artifactId: "note-1",
        state: "REQUESTED",
      },
    ];

    expect(
      canEditMeetingSharedNote({
        artifactId: "note-1",
        currentUserId: "student",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides,
      }),
    ).toBe(false);
  });

  it("treats REQUESTED state as blocked for whiteboard drawing", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "student",
        targetType: "WHITEBOARD",
        artifactId: "board-1",
        state: "REQUESTED",
      },
    ];

    expect(
      canEditMeetingWhiteboard({
        artifactId: "board-1",
        currentUserId: "student",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides,
      }),
    ).toBe(false);
  });

  it("treats REQUESTED state as blocked for video permissions", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "student",
        targetType: "SCREEN_SHARE",
        artifactId: null,
        state: "REQUESTED",
      },
    ];

    expect(
      resolveMeetingVideoPermission({
        currentUserId: "student",
        meetingCreatedByUserId,
        currentUserRole: "MEMBER",
        overrides,
        targetType: "SCREEN_SHARE",
      }),
    ).toBe(false);
  });

  it("allows a tutor to manage a student's permissions", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "tutor",
        currentUserRole: "TUTOR",
        meetingCreatedByUserId: "other",
        targetUserId: "student",
        targetUserRole: "MEMBER",
      }),
    ).toBe(true);
  });

  it("does not allow a student to approve their own request", () => {
    expect(
      canManageMeetingParticipantPermissions({
        currentUserId: "student",
        currentUserRole: "MEMBER",
        meetingCreatedByUserId: "tutor",
        targetUserId: "student",
        targetUserRole: "MEMBER",
      }),
    ).toBe(false);
  });
});

describe("meeting artifact permissions", () => {
  it("applies default shared-note writing blocks to meeting creators", () => {
    expect(
      canEditMeetingSharedNote({
        artifactId: "note-1",
        currentUserId: "dhyan",
        meetingCreatedByUserId: "dhyan",
        currentUserRole: "MEMBER",
        overrides: [],
      }),
    ).toBe(false);
  });

  it("allows meeting creators to write shared notes when explicitly allowed", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "dhyan",
        targetType: "SHARED_NOTES",
        artifactId: "note-1",
        state: "ALLOWED",
      },
    ];

    expect(
      canEditMeetingSharedNote({
        artifactId: "note-1",
        currentUserId: "dhyan",
        meetingCreatedByUserId: "dhyan",
        currentUserRole: "MEMBER",
        overrides,
      }),
    ).toBe(true);
  });

  it("applies default whiteboard blocks to meeting creators", () => {
    expect(
      canEditMeetingWhiteboard({
        artifactId: "board-1",
        currentUserId: "dhyan",
        meetingCreatedByUserId: "dhyan",
        currentUserRole: "MEMBER",
        overrides: [],
      }),
    ).toBe(false);
  });

  it("allows meeting creators to draw when explicitly allowed", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "dhyan",
        targetType: "WHITEBOARD",
        artifactId: "board-1",
        state: "ALLOWED",
      },
    ];

    expect(
      canEditMeetingWhiteboard({
        artifactId: "board-1",
        currentUserId: "dhyan",
        meetingCreatedByUserId: "dhyan",
        currentUserRole: "MEMBER",
        overrides,
      }),
    ).toBe(true);
  });

  it("keeps workspace owners able to edit boards", () => {
    const overrides: MeetingPermissionOverrideInput[] = [
      {
        userId: "karuna",
        targetType: "WHITEBOARD",
        artifactId: "board-1",
        state: "DENIED",
      },
    ];

    expect(
      canEditMeetingWhiteboard({
        artifactId: "board-1",
        currentUserId: "karuna",
        meetingCreatedByUserId: "dhyan",
        currentUserRole: "OWNER",
        overrides,
      }),
    ).toBe(true);
  });
});
