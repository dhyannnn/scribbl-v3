import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const {
  resolveNoteComment,
  deleteNoteComment,
  addNoteComment,
  saveNoteSnapshot,
  toggleNoteShare,
  updateNotePageSetup,
} = await import("@/app/workspaces/[id]/notes/actions");

// ── Shared fixtures ───────────────────────────────────────────────────────────

const owner = makeUser();
const member = makeUser();
const admin = makeUser();
const workspace = makeWorkspace(owner.id);
const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
const memberMembership = makeMembership(workspace.id, member.id, { role: "MEMBER" });
const adminMembership = makeMembership(workspace.id, admin.id, { role: "ADMIN" });

// ── resolveNoteComment (#36) ──────────────────────────────────────────────────

describe("resolveNoteComment", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when user is not an active member", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { status: "REMOVED" }),
    );
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: owner.id } as never);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the comment does not exist in this workspace", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.noteComment.findFirst.mockResolvedValue(null);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).not.toHaveBeenCalled();
  });

  it("allows the comment author to resolve their own comment", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    mockGetCurrentUser.mockResolvedValue(member);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).toHaveBeenCalled();
  });

  it("allows an ADMIN to resolve another member's comment", async () => {
    mockGetCurrentUser.mockResolvedValue(admin);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(adminMembership);
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).toHaveBeenCalled();
  });

  it("blocks a MEMBER from resolving another member's comment", async () => {
    const otherMember = makeUser();
    mockGetCurrentUser.mockResolvedValue(otherMember);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, otherMember.id, { role: "MEMBER" }),
    );
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    await resolveNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.updateMany).not.toHaveBeenCalled();
  });
});

// ── deleteNoteComment (#36) ───────────────────────────────────────────────────

describe("deleteNoteComment", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await deleteNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.deleteMany).not.toHaveBeenCalled();
  });

  it("allows the comment author to delete their own comment", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    mockGetCurrentUser.mockResolvedValue(member);
    await deleteNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.deleteMany).toHaveBeenCalled();
  });

  it("blocks a MEMBER from deleting another member's comment", async () => {
    const otherMember = makeUser();
    mockGetCurrentUser.mockResolvedValue(otherMember);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, otherMember.id, { role: "MEMBER" }),
    );
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    await deleteNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.deleteMany).not.toHaveBeenCalled();
  });

  it("allows an OWNER to delete any comment", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.noteComment.findFirst.mockResolvedValue({ userId: member.id } as never);
    await deleteNoteComment("note-1", workspace.id, "cid-1");
    expect(prismaMock.noteComment.deleteMany).toHaveBeenCalled();
  });
});

// ── addNoteComment (#37 / #43) ────────────────────────────────────────────────

describe("addNoteComment", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(member);
  });

  it("does nothing when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await addNoteComment("note-1", workspace.id, "cid-1", "hello");
    expect(prismaMock.noteComment.create).not.toHaveBeenCalled();
  });

  it("does nothing when note does not belong to the workspace", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    prismaMock.note.findFirst.mockResolvedValue(null); // workspaceId constraint filters it out
    await addNoteComment("note-1", workspace.id, "cid-1", "hello");
    expect(prismaMock.noteComment.create).not.toHaveBeenCalled();
  });

  it("does nothing when user is not an active member", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { status: "REMOVED" }),
    );
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1" } as never);
    await addNoteComment("note-1", workspace.id, "cid-1", "hello");
    expect(prismaMock.noteComment.create).not.toHaveBeenCalled();
  });

  it("creates a comment for an active member", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1" } as never);
    prismaMock.noteComment.create.mockResolvedValue({} as never);
    await addNoteComment("note-1", workspace.id, "cid-1", "hello");
    expect(prismaMock.noteComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ text: "hello" }) }),
    );
  });
});

// ── saveNoteSnapshot (#37) ────────────────────────────────────────────────────

describe("saveNoteSnapshot", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await saveNoteSnapshot("note-1", {});
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does nothing when note has no workspaceId", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", workspaceId: null, ownerUserId: owner.id, collaboration: "SOLO" } as never);
    await saveNoteSnapshot("note-1", {});
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does nothing when user is not owner of a solo note", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", workspaceId: workspace.id, ownerUserId: owner.id, collaboration: "SOLO" } as never);
    await saveNoteSnapshot("note-1", {});
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does nothing when user is not an active member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", workspaceId: workspace.id, ownerUserId: owner.id, collaboration: "SOLO" } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { status: "REMOVED" }),
    );
    await saveNoteSnapshot("note-1", {});
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("saves snapshot for the note owner who is an active member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", workspaceId: workspace.id, ownerUserId: owner.id, collaboration: "SOLO" } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") await fn(prismaMock);
    });
    prismaMock.noteSnapshot.create.mockResolvedValue({} as never);
    prismaMock.noteSnapshot.count.mockResolvedValue(1);

    await saveNoteSnapshot("note-1", { type: "tiptap" });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });
});

// ── toggleNoteShare (#42) ─────────────────────────────────────────────────────

describe("toggleNoteShare", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("returns false when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(false);
  });

  it("returns false when note not found", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(false);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("returns false when user is not the note owner", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, isPublic: false, shareToken: null } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(false);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("returns false when user is removed member (even if owner)", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, isPublic: false, shareToken: null } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, owner.id, { status: "REMOVED" }),
    );
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(false);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("toggles note to public for the active owner", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, isPublic: false, shareToken: null } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.note.update.mockResolvedValue({} as never);
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(true);
    expect(prismaMock.note.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPublic: true }) }),
    );
  });

  it("toggles note back to private", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, isPublic: true, shareToken: "existing-token" } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.note.update.mockResolvedValue({} as never);
    const result = await toggleNoteShare("note-1", workspace.id);
    expect(result.isPublic).toBe(false);
    expect(result.shareToken).toBeNull();
  });
});

// ── updateNotePageSetup (#41) ─────────────────────────────────────────────────

describe("updateNotePageSetup", () => {
  const pageData = { orientation: "portrait", marginTop: 20, marginBottom: 20, marginLeft: 20, marginRight: 20 };

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("does nothing when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await updateNotePageSetup("note-1", workspace.id, pageData);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("does nothing when note not found in this workspace", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    await updateNotePageSetup("note-1", workspace.id, pageData);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("does nothing when user is not the note owner", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, workspaceId: workspace.id } as never);
    await updateNotePageSetup("note-1", workspace.id, pageData);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });

  it("updates page setup for the note owner", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ id: "note-1", ownerUserId: owner.id, workspaceId: workspace.id } as never);
    prismaMock.note.update.mockResolvedValue({} as never);
    await updateNotePageSetup("note-1", workspace.id, pageData);
    expect(prismaMock.note.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "note-1" },
        data: expect.objectContaining({ orientation: "portrait" }),
      }),
    );
  });

  it("uses workspaceId in the note lookup — cross-workspace mutation blocked", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null); // workspaceId mismatch filtered by Prisma
    await updateNotePageSetup("note-1", "other-workspace", pageData);
    expect(prismaMock.note.update).not.toHaveBeenCalled();
  });
});
