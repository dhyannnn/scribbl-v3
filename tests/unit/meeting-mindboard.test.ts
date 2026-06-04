import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeMeeting, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { createMeetingNote, saveMeetingWhiteboard } = await import(
  "@/app/workspaces/[id]/meetings/[meetingId]/actions"
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeActiveMeeting(workspaceId: string, createdByUserId: string) {
  return makeMeeting(workspaceId, createdByUserId, {
    startsAt: new Date(Date.now() - 10 * 60 * 1000),   // started 10 min ago
    endsAt: new Date(Date.now() + 50 * 60 * 1000),     // ends in 50 min
    canceledAt: null,
  });
}

// Minimal meeting object returned by prisma.meeting.findFirst inside createMeetingNote
function makeMeetingRow(meeting: ReturnType<typeof makeMeeting>, creatorId: string) {
  return {
    id: meeting.id,
    title: meeting.title,
    createdByUserId: creatorId,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    canceledAt: null,
    moderationSettings: null,
    permissionOverrides: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createMeetingNote — MINDBOARD type
// ─────────────────────────────────────────────────────────────────────────────

describe("createMeetingNote — MINDBOARD type", () => {
  const user = makeUser();
  const freeWorkspace = makeWorkspace(user.id, { plan: "FREE" });
  const proWorkspace  = makeWorkspace(user.id, { plan: "PRO" });
  const newNote = { id: "note-meeting-mb-001" };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.note.create.mockResolvedValue(newNote as never);
    prismaMock.meetingArtifact.create.mockResolvedValue({ id: "artifact-001" } as never);
  });

  it("rejects an unknown note type", async () => {
    const meeting = makeActiveMeeting(proWorkspace.id, user.id);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(makeMembership(proWorkspace.id, user.id));
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeetingRow(meeting, user.id) as never);

    // Should bail silently (no redirect) because type validation fails
    await createMeetingNote(
      makeFormData({
        workspaceId: proWorkspace.id,
        meetingId: meeting.id,
        scope: "SHARED",
        type: "DRAWING", // invalid
      }),
    );

    expect(prismaMock.note.create).not.toHaveBeenCalled();
  });

  it("blocks a shared MINDBOARD on a FREE workspace", async () => {
    const meeting = makeActiveMeeting(freeWorkspace.id, user.id);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(makeMembership(freeWorkspace.id, user.id));
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeetingRow(meeting, user.id) as never);
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);

    const url = await captureRedirect(() =>
      createMeetingNote(
        makeFormData({
          workspaceId: freeWorkspace.id,
          meetingId: meeting.id,
          scope: "SHARED",
          type: "MINDBOARD",
        }),
      ),
    );

    expect(url).toContain("whiteboard-upgrade-required");
    expect(prismaMock.note.create).not.toHaveBeenCalled();
  });

  it("allows a private MINDBOARD on a FREE workspace without plan check", async () => {
    const meeting = makeActiveMeeting(freeWorkspace.id, user.id);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(makeMembership(freeWorkspace.id, user.id));
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeetingRow(meeting, user.id) as never);

    const url = await captureRedirect(() =>
      createMeetingNote(
        makeFormData({
          workspaceId: freeWorkspace.id,
          meetingId: meeting.id,
          scope: "PRIVATE",
          type: "MINDBOARD",
        }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "MINDBOARD", visibility: "PRIVATE" }),
      }),
    );
    expect(url).toContain(newNote.id);
  });

  it("creates a shared MINDBOARD on a PRO workspace with WHITEBOARD artifact type", async () => {
    const meeting = makeActiveMeeting(proWorkspace.id, user.id);
    // OWNER role passes resolveMeetingArtifactPermission's role check unconditionally
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, user.id, { role: "OWNER" }),
    );
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeetingRow(meeting, user.id) as never);

    const url = await captureRedirect(() =>
      createMeetingNote(
        makeFormData({
          workspaceId: proWorkspace.id,
          meetingId: meeting.id,
          scope: "SHARED",
          type: "MINDBOARD",
        }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "MINDBOARD",
          visibility: "WORKSPACE_SHARED",
          collaboration: "COLLABORATIVE",
        }),
      }),
    );
    // artifact created with WHITEBOARD type (mindboards reuse the WHITEBOARD artifact slot)
    expect(prismaMock.meetingArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "WHITEBOARD" }),
      }),
    );
    expect(url).toContain(newNote.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveMeetingWhiteboard — accepts MINDBOARD note type
// ─────────────────────────────────────────────────────────────────────────────

describe("saveMeetingWhiteboard — MINDBOARD note", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id, { plan: "PRO" });
  const meetingId = "00000000-0000-0000-0000-000000000099";
  const noteId    = "00000000-0000-0000-0000-000000000100";
  const artifactId = "00000000-0000-0000-0000-000000000101";

  const snapshot = { document: { id: "doc1" }, session: {} };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(makeMembership(workspace.id, user.id));
    prismaMock.workspace.findUnique.mockResolvedValue(workspace as never);
  });

  it("saves a MINDBOARD snapshot via saveMeetingWhiteboard", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue({
      id: artifactId,
      noteId,
      source: "CREATED_IN_MEETING",
      meeting: {
        createdByUserId: user.id,
        startsAt: new Date(Date.now() - 10 * 60 * 1000),
        endsAt: new Date(Date.now() + 50 * 60 * 1000),
        canceledAt: null,
        moderationSettings: null,
        permissionOverrides: [
          {
            userId: user.id,
            targetType: "WHITEBOARD",
            artifactId,
            state: "ALLOWED",
          },
        ],
      },
      note: {
        ownerUserId: user.id,
        collaboration: "COLLABORATIVE",
        visibility: "WORKSPACE_SHARED",
      },
    } as never);

    await saveMeetingWhiteboard(
      makeFormData({
        workspaceId: workspace.id,
        meetingId,
        noteId,
        title: "Team mind board",
        snapshotJson: JSON.stringify(snapshot),
      }),
    );

    expect(prismaMock.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: noteId },
        data: expect.objectContaining({
          title: "Team mind board",
          contentJson: { type: "tldraw", snapshot },
        }),
      }),
    );
  });

  it("does nothing when the artifact is not found (wrong note type etc.)", async () => {
    prismaMock.meetingArtifact.findFirst.mockResolvedValue(null);

    await saveMeetingWhiteboard(
      makeFormData({
        workspaceId: workspace.id,
        meetingId,
        noteId,
        title: "Board",
        snapshotJson: JSON.stringify(snapshot),
      }),
    );

    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });
});
