import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { createMindboardNote, createWhiteboardNote } = await import("@/app/workspaces/[id]/notes/actions");

// ─────────────────────────────────────────────────────────────────────────────
// createMindboardNote
// ─────────────────────────────────────────────────────────────────────────────

describe("createMindboardNote", () => {
  const owner = makeUser();
  const freeWorkspace = makeWorkspace(owner.id, { plan: "FREE" });
  const proWorkspace = makeWorkspace(owner.id, { plan: "PRO" });

  const newNote = { id: "note-mb-001" };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.note.create.mockResolvedValue(newNote as never);
  });

  // ── authentication ────────────────────────────────────────────────────────

  it("redirects to root when workspaceId is missing", async () => {
    const url = await captureRedirect(() =>
      createMindboardNote(makeFormData({ visibility: "PRIVATE" })),
    );
    expect(url).toBe("/");
  });

  it("redirects to invalid when visibility is not recognised", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);
    const url = await captureRedirect(() =>
      createMindboardNote(
        makeFormData({ workspaceId: freeWorkspace.id, visibility: "WORLD" }),
      ),
    );
    expect(url).toContain("invalid");
  });

  // ── free-plan gating ──────────────────────────────────────────────────────

  it("blocks a shared mindboard on a FREE workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);

    const url = await captureRedirect(() =>
      createMindboardNote(
        makeFormData({
          workspaceId: freeWorkspace.id,
          visibility: "WORKSPACE_SHARED",
          collaboration: "COLLABORATIVE",
        }),
      ),
    );

    expect(url).toContain("shared-mindboard-upgrade-required");
    expect(prismaMock.note.create).not.toHaveBeenCalled();
  });

  it("allows a private mindboard on a FREE workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(freeWorkspace.id, owner.id),
    );

    const url = await captureRedirect(() =>
      createMindboardNote(
        makeFormData({
          workspaceId: freeWorkspace.id,
          visibility: "PRIVATE",
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

  // ── pro workspace ─────────────────────────────────────────────────────────

  it("creates a shared collaborative mindboard on a PRO workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(proWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, owner.id),
    );

    const url = await captureRedirect(() =>
      createMindboardNote(
        makeFormData({
          workspaceId: proWorkspace.id,
          visibility: "WORKSPACE_SHARED",
          collaboration: "COLLABORATIVE",
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
    expect(url).toContain(newNote.id);
  });

  it("creates a shared read-only mindboard on a PRO workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(proWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, owner.id),
    );

    await captureRedirect(() =>
      createMindboardNote(
        makeFormData({
          workspaceId: proWorkspace.id,
          visibility: "WORKSPACE_SHARED",
          collaboration: "SOLO",
        }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "MINDBOARD",
          collaboration: "SOLO",
        }),
      }),
    );
  });

  // ── membership guard ──────────────────────────────────────────────────────

  it("blocks an inactive member from creating a mindboard", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(proWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, owner.id, { status: "INVITED" }),
    );

    const url = await captureRedirect(() =>
      createMindboardNote(
        makeFormData({ workspaceId: proWorkspace.id, visibility: "PRIVATE" }),
      ),
    );

    expect(url).toContain("unauthorized");
    expect(prismaMock.note.create).not.toHaveBeenCalled();
  });

  it("forces collaboration to SOLO when visibility is PRIVATE", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(proWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, owner.id),
    );

    await captureRedirect(() =>
      createMindboardNote(
        makeFormData({
          workspaceId: proWorkspace.id,
          visibility: "PRIVATE",
          collaboration: "COLLABORATIVE", // should be overridden
        }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ collaboration: "SOLO" }),
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createWhiteboardNote — shared whiteboard gating mirrors mindboard gating
// ─────────────────────────────────────────────────────────────────────────────

describe("createWhiteboardNote — free-plan gating", () => {
  const owner = makeUser();
  const freeWorkspace = makeWorkspace(owner.id, { plan: "FREE" });
  const proWorkspace = makeWorkspace(owner.id, { plan: "PRO" });
  const newNote = { id: "note-wb-001" };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.note.create.mockResolvedValue(newNote as never);
  });

  it("blocks a shared whiteboard on a FREE workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);

    const url = await captureRedirect(() =>
      createWhiteboardNote(
        makeFormData({
          workspaceId: freeWorkspace.id,
          visibility: "WORKSPACE_SHARED",
          collaboration: "COLLABORATIVE",
        }),
      ),
    );

    expect(url).toContain("shared-whiteboard-upgrade-required");
    expect(prismaMock.note.create).not.toHaveBeenCalled();
  });

  it("allows a private whiteboard on a FREE workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(freeWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(freeWorkspace.id, owner.id),
    );

    await captureRedirect(() =>
      createWhiteboardNote(
        makeFormData({ workspaceId: freeWorkspace.id, visibility: "PRIVATE" }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "WHITEBOARD", visibility: "PRIVATE" }),
      }),
    );
  });

  it("allows a shared whiteboard on a PRO workspace", async () => {
    prismaMock.workspace.findUnique.mockResolvedValue(proWorkspace as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(proWorkspace.id, owner.id),
    );

    await captureRedirect(() =>
      createWhiteboardNote(
        makeFormData({
          workspaceId: proWorkspace.id,
          visibility: "WORKSPACE_SHARED",
          collaboration: "COLLABORATIVE",
        }),
      ),
    );

    expect(prismaMock.note.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "WHITEBOARD", visibility: "WORKSPACE_SHARED" }),
      }),
    );
  });
});
