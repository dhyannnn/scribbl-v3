import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { deleteWorkspaceNote } = await import("@/app/workspaces/[id]/notes/actions");

// ─────────────────────────────────────────────────────────────────────────────
// deleteWorkspaceNote — private vs shared note access
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteWorkspaceNote", () => {
  const owner = makeUser();
  const otherMember = makeUser();
  const admin = makeUser();
  const workspace = makeWorkspace(owner.id);

  const sharedNote = {
    id: "note-shared",
    ownerUserId: owner.id,
    visibility: "WORKSPACE_SHARED" as const,
    artifacts: [],
  };

  const privateNote = {
    id: "note-private",
    ownerUserId: owner.id,
    visibility: "PRIVATE" as const,
    artifacts: [],
  };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await deleteWorkspaceNote(
      makeFormData({ workspaceId: workspace.id, noteId: "note-1" }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not an active member", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null); // Prisma WHERE filters inactive members
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);

    await deleteWorkspaceNote(
      makeFormData({ workspaceId: workspace.id, noteId: "note-1" }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows the note owner to delete their own shared note", async () => {
    prismaMock.note.findFirst.mockResolvedValue(sharedNote as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "MEMBER" }),
    );
    prismaMock.$transaction.mockResolvedValue(undefined as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceNote(makeFormData({ workspaceId: workspace.id, noteId: sharedNote.id })),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("deleted");
  });

  it("allows the note owner to delete their own private note", async () => {
    prismaMock.note.findFirst.mockResolvedValue(privateNote as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { role: "MEMBER" }),
    );
    prismaMock.$transaction.mockResolvedValue(undefined as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceNote(makeFormData({ workspaceId: workspace.id, noteId: privateNote.id })),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("deleted");
  });

  it("blocks a non-owner MEMBER from deleting a shared note they did not create", async () => {
    mockGetCurrentUser.mockResolvedValue(otherMember);
    // The note's ownerUserId does not match otherMember
    prismaMock.note.findFirst.mockResolvedValue(sharedNote as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, otherMember.id, { role: "MEMBER" }),
    );

    await deleteWorkspaceNote(
      makeFormData({ workspaceId: workspace.id, noteId: sharedNote.id }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks a non-owner MEMBER from deleting a private note they do not own", async () => {
    mockGetCurrentUser.mockResolvedValue(otherMember);
    // Prisma WHERE clause already excludes PRIVATE notes that don't belong to
    // the requester, so findFirst returns null for an unauthorized access.
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, otherMember.id, { role: "MEMBER" }),
    );

    await deleteWorkspaceNote(
      makeFormData({ workspaceId: workspace.id, noteId: privateNote.id }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to delete a shared note created by another member", async () => {
    mockGetCurrentUser.mockResolvedValue(admin);
    prismaMock.note.findFirst.mockResolvedValue(sharedNote as never); // owned by 'owner', not admin
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, admin.id, { role: "ADMIN" }),
    );
    prismaMock.$transaction.mockResolvedValue(undefined as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceNote(makeFormData({ workspaceId: workspace.id, noteId: sharedNote.id })),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("deleted");
  });

  it("blocks an ADMIN from deleting a private note they do not own", async () => {
    // Private notes are filtered at the DB query level with ownerUserId constraint;
    // if the admin doesn't own the note, findFirst returns null.
    mockGetCurrentUser.mockResolvedValue(admin);
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, admin.id, { role: "ADMIN" }),
    );

    await deleteWorkspaceNote(
      makeFormData({ workspaceId: workspace.id, noteId: privateNote.id }),
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
