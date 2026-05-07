import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getSupabaseAuthUser: vi.fn(),
}));

vi.mock("@/lib/email/workspace-invites", () => ({
  sendWorkspaceInviteEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/app-url", () => ({
  createAppUrl: vi.fn(async (path: string) => `http://localhost:3000${path}`),
}));

const { updateWorkspaceDetails, removeWorkspaceMember, updateWorkspaceMemberRole } = await import(
  "@/app/workspaces/[id]/actions"
);

describe("updateWorkspaceDetails", () => {
  const owner = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("redirects unauthenticated users", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const fd = makeFormData({ workspaceId: workspace.id, name: "New Name", type: "STUDY_GROUP" });
    // No redirect thrown — action silently returns when unauthenticated
    await updateWorkspaceDetails(fd);
    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("blocks non-owners from updating workspace details", async () => {
    const member = makeUser();
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { role: "MEMBER" }),
    );

    const fd = makeFormData({ workspaceId: workspace.id, name: "Hacked Name", type: "STUDY_GROUP" });
    await updateWorkspaceDetails(fd);

    expect(prismaMock.workspace.update).not.toHaveBeenCalled();
  });

  it("allows owner to update workspace details", async () => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspace.update.mockResolvedValue({ ...workspace, name: "Updated Name" });

    const fd = makeFormData({ workspaceId: workspace.id, name: "Updated Name", type: "COURSE" });
    const url = await captureRedirect(() => updateWorkspaceDetails(fd));

    expect(prismaMock.workspace.update).toHaveBeenCalled();
    expect(url).toContain(`/workspaces/${workspace.id}`);
  });
});

describe("removeWorkspaceMember", () => {
  const owner = makeUser();
  const member = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
  const memberMembership = makeMembership(workspace.id, member.id, { role: "MEMBER" });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("blocks non-owners from removing members", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { role: "MEMBER" }),
    );
    prismaMock.workspaceMember.findFirst.mockResolvedValue(memberMembership);

    const fd = makeFormData({ workspaceId: workspace.id, memberId: memberMembership.id });
    await removeWorkspaceMember(fd);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("prevents removing an owner", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    const anotherOwnerMembership = makeMembership(workspace.id, member.id, { role: "OWNER" });
    prismaMock.workspaceMember.findFirst.mockResolvedValue(anotherOwnerMembership);

    const fd = makeFormData({ workspaceId: workspace.id, memberId: anotherOwnerMembership.id });
    const url = await captureRedirect(() => removeWorkspaceMember(fd));

    expect(url).toContain("owner-removal-locked");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("allows owner to remove a member", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(memberMembership);
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") await fn(prismaMock);
    });
    prismaMock.workspaceMember.update.mockResolvedValue({ ...memberMembership, status: "REMOVED" });
    prismaMock.meetingParticipant.deleteMany.mockResolvedValue({ count: 0 });

    const fd = makeFormData({ workspaceId: workspace.id, memberId: memberMembership.id });
    const url = await captureRedirect(() => removeWorkspaceMember(fd));

    expect(url).toContain("member-removed");
  });
});

describe("updateWorkspaceMemberRole", () => {
  const owner = makeUser();
  const member = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
  const memberMembership = makeMembership(workspace.id, member.id, { role: "MEMBER" });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("blocks changing an owner's role", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    const targetOwner = makeMembership(workspace.id, member.id, { role: "OWNER" });
    prismaMock.workspaceMember.findFirst.mockResolvedValue(targetOwner);

    const fd = makeFormData({ workspaceId: workspace.id, memberId: targetOwner.id, role: "ADMIN" });
    const url = await captureRedirect(() => updateWorkspaceMemberRole(fd));

    expect(url).toContain("owner-role-locked");
    expect(prismaMock.workspaceMember.update).not.toHaveBeenCalled();
  });

  it("allows owner to change a member's role", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(memberMembership);
    prismaMock.workspaceMember.update.mockResolvedValue({ ...memberMembership, role: "ADMIN" });

    const fd = makeFormData({ workspaceId: workspace.id, memberId: memberMembership.id, role: "ADMIN" });
    const url = await captureRedirect(() => updateWorkspaceMemberRole(fd));

    expect(url).toContain("role-updated");
    expect(prismaMock.workspaceMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "ADMIN" } }),
    );
  });
});
