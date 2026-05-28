import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeMeeting, makeFormData } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { saveMeetingNote, saveMeetingWhiteboard } = await import(
  "@/app/workspaces/[id]/meetings/[meetingId]/actions"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeArtifactRow({
  userId,
  meetingCreatedByUserId,
  noteVisibility = "WORKSPACE_SHARED",
  ownerUserId,
  source = "CREATED_IN_MEETING",
  startsAt = new Date(Date.now() - 60 * 60 * 1000),
  endsAt = new Date(Date.now() + 60 * 60 * 1000), // live by default
  canceledAt = null,
  overrides = [],
  moderationSettings = null,
}: {
  userId: string;
  meetingCreatedByUserId: string;
  noteVisibility?: "WORKSPACE_SHARED" | "PRIVATE";
  ownerUserId?: string;
  source?: "CREATED_IN_MEETING" | "ATTACHED";
  startsAt?: Date;
  endsAt?: Date;
  canceledAt?: Date | null;
  overrides?: { userId: string; targetType: string; artifactId: string | null; state: string }[];
  moderationSettings?: null | { sharedNotesDefaultEdit: boolean; whiteboardDefaultEdit: boolean; micDefaultEnabled: boolean; cameraDefaultEnabled: boolean; screenShareDefaultEnabled: boolean; reactionsEnabled: boolean; handRaiseEnabled: boolean };
}) {
  return {
    id: "artifact-1",
    noteId: "note-1",
    source,
    meeting: {
      createdByUserId: meetingCreatedByUserId,
      startsAt,
      endsAt,
      canceledAt,
      moderationSettings,
      permissionOverrides: overrides,
    },
    note: {
      ownerUserId: ownerUserId ?? userId,
      collaboration: "COLLABORATIVE",
      visibility: noteVisibility,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// saveMeetingNote — locked artifact enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("saveMeetingNote — locked artifact enforcement", () => {
  const tutor = makeUser();
  const student = makeUser();
  const workspace = makeWorkspace(tutor.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(student);
  });

  it("does nothing when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await saveMeetingNote(
      makeFormData({ workspaceId: workspace.id, meetingId: "mtg-1", noteId: "note-1" }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("blocks saving a shared note after the meeting ends", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        endsAt: new Date(Date.now() - 10 * 60 * 1000), // ended 10 min ago
        source: "CREATED_IN_MEETING",
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        contentJson: JSON.stringify({ type: "doc" }),
        title: "My notes",
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("blocks saving a shared note after the meeting is canceled", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        canceledAt: new Date(Date.now() - 5 * 60 * 1000),
        source: "CREATED_IN_MEETING",
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        title: "My notes",
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("blocks a student without an ALLOWED override from saving during a live meeting", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        overrides: [], // no override → default is blocked
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        title: "My notes",
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("allows a student with an ALLOWED override to save during a live meeting", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        overrides: [
          { userId: student.id, targetType: "SHARED_NOTES", artifactId: "artifact-1", state: "ALLOWED" },
        ],
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );
    prismaMock.note.update.mockResolvedValue({} as never);

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        title: "My notes",
      }),
    );

    expect(prismaMock.note.update).toHaveBeenCalled();
  });

  it("allows an OWNER to always save, regardless of override state", async () => {
    mockGetCurrentUser.mockResolvedValue(tutor);
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: tutor.id,
        meetingCreatedByUserId: tutor.id,
        ownerUserId: tutor.id,
        overrides: [], // no explicit override needed for owner
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, tutor.id, { role: "OWNER" }),
    );
    prismaMock.note.update.mockResolvedValue({} as never);

    await saveMeetingNote(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        contentJson: JSON.stringify({ type: "doc", content: [] }),
        title: "My notes",
      }),
    );

    expect(prismaMock.note.update).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveMeetingWhiteboard — locked artifact enforcement
// ─────────────────────────────────────────────────────────────────────────────

describe("saveMeetingWhiteboard — locked artifact enforcement", () => {
  const tutor = makeUser();
  const student = makeUser();
  const workspace = makeWorkspace(tutor.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(student);
  });

  it("blocks saving a whiteboard after the meeting ends", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        endsAt: new Date(Date.now() - 10 * 60 * 1000),
        source: "CREATED_IN_MEETING",
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );

    await saveMeetingWhiteboard(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        title: "My board",
        snapshotJson: JSON.stringify({ document: {} }),
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("blocks a student without ALLOWED override from drawing", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(
      makeArtifactRow({
        userId: student.id,
        meetingCreatedByUserId: tutor.id,
        overrides: [],
      }) as never,
    );
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, student.id, { role: "MEMBER" }),
    );

    await saveMeetingWhiteboard(
      makeFormData({
        workspaceId: workspace.id,
        meetingId: "mtg-1",
        noteId: "note-1",
        title: "My board",
        snapshotJson: JSON.stringify({ document: {} }),
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });
});
