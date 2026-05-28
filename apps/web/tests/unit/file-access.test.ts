import { describe, expect, it, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  })),
}));

vi.mock("@/lib/env", () => ({
  getStorageBucketName: vi.fn(() => "files"),
}));

const { deleteWorkspaceFile } = await import("@/app/workspaces/[id]/files/actions");

// ─────────────────────────────────────────────────────────────────────────────

function makeFileRow(uploadedByUserId: string, visibility = "WORKSPACE_SHARED") {
  return {
    id: "file-1",
    uploadedByUserId,
    visibility,
    storageBucket: "files",
    storageKey: "uploads/workspaces/ws-1/files/test.pdf",
    noteContentFor: null,
    artifacts: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("deleteWorkspaceFile", () => {
  const uploader = makeUser();
  const otherMember = makeUser();
  const admin = makeUser();
  const workspace = makeWorkspace(uploader.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(uploader);
  });

  it("redirects to login when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(
        makeFormData({ workspaceId: workspace.id, fileId: "file-1" }),
      ),
    );

    expect(url).toMatch(/\/login/);
  });

  it("redirects with unauthorized when the user is not an active member", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);
    prismaMock.file.findFirst.mockResolvedValue(makeFileRow(uploader.id) as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(
        makeFormData({ workspaceId: workspace.id, fileId: "file-1" }),
      ),
    );

    expect(url).toContain("unauthorized");
  });

  it("allows the uploader to delete their own shared file", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, uploader.id, { role: "MEMBER" }),
    );
    prismaMock.file.findFirst.mockResolvedValue(makeFileRow(uploader.id) as never);
    prismaMock.$transaction.mockResolvedValue(undefined as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(makeFormData({ workspaceId: workspace.id, fileId: "file-1" })),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("deleted");
  });

  it("blocks a non-owner MEMBER from deleting a shared file they did not upload", async () => {
    mockGetCurrentUser.mockResolvedValue(otherMember);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, otherMember.id, { role: "MEMBER" }),
    );
    prismaMock.file.findFirst.mockResolvedValue(makeFileRow(uploader.id) as never); // uploaded by someone else

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(
        makeFormData({ workspaceId: workspace.id, fileId: "file-1" }),
      ),
    );

    expect(url).toContain("unauthorized");
    expect(prismaMock.file.delete).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to delete a file uploaded by another member", async () => {
    mockGetCurrentUser.mockResolvedValue(admin);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, admin.id, { role: "ADMIN" }),
    );
    prismaMock.file.findFirst.mockResolvedValue(makeFileRow(uploader.id) as never);
    prismaMock.$transaction.mockResolvedValue(undefined as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(makeFormData({ workspaceId: workspace.id, fileId: "file-1" })),
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("deleted");
  });

  it("blocks deletion of a private file by a non-owner even if they are ADMIN", async () => {
    // Private file: only the uploader can delete regardless of role.
    mockGetCurrentUser.mockResolvedValue(admin);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, admin.id, { role: "ADMIN" }),
    );
    prismaMock.file.findFirst.mockResolvedValue(
      makeFileRow(uploader.id, "PRIVATE") as never,
    );

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(
        makeFormData({ workspaceId: workspace.id, fileId: "file-1" }),
      ),
    );

    expect(url).toContain("unauthorized");
    expect(prismaMock.file.delete).not.toHaveBeenCalled();
  });

  it("blocks deletion when the file is attached as note content", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, uploader.id, { role: "MEMBER" }),
    );
    prismaMock.file.findFirst.mockResolvedValue({
      ...makeFileRow(uploader.id),
      noteContentFor: { id: "note-1" }, // file is used as note content
    } as never);

    const url = await captureRedirect(() =>
      deleteWorkspaceFile(
        makeFormData({ workspaceId: workspace.id, fileId: "file-1" }),
      ),
    );

    expect(url).toContain("delete-attached");
    expect(prismaMock.file.delete).not.toHaveBeenCalled();
  });
});
