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

const { transferWorkspaceOwnership } = await import("@/app/workspaces/[id]/actions");

describe("transferWorkspaceOwnership", () => {
  const owner = makeUser();
  const member = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
  const memberMembership = makeMembership(workspace.id, member.id, { role: "MEMBER" });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(owner);
  });

  it("requires DELETE confirmation text", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(memberMembership);

    const fd = makeFormData({
      workspaceId: workspace.id,
      memberId: memberMembership.id,
      confirmation: "transfer", // wrong case
    });
    const url = await captureRedirect(() => transferWorkspaceOwnership(fd));

    expect(url).toContain("transfer-confirmation-required");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks non-owners from transferring ownership", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(memberMembership);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(ownerMembership);

    const fd = makeFormData({
      workspaceId: workspace.id,
      memberId: ownerMembership.id,
      confirmation: "TRANSFER",
    });
    const url = await captureRedirect(() => transferWorkspaceOwnership(fd));

    expect(url).toContain("unauthorized");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("prevents transferring ownership to self", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    // next owner is the same user — userId matches currentUser.id
    const selfMembership = makeMembership(workspace.id, owner.id, { role: "ADMIN" });
    prismaMock.workspaceMember.findFirst.mockResolvedValue(selfMembership);

    const fd = makeFormData({
      workspaceId: workspace.id,
      memberId: selfMembership.id,
      confirmation: "TRANSFER",
    });
    const url = await captureRedirect(() => transferWorkspaceOwnership(fd));

    expect(url).toContain("transfer-invalid");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("prevents transferring to someone who is already owner", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    const alreadyOwner = makeMembership(workspace.id, member.id, { role: "OWNER" });
    prismaMock.workspaceMember.findFirst.mockResolvedValue(alreadyOwner);

    const fd = makeFormData({
      workspaceId: workspace.id,
      memberId: alreadyOwner.id,
      confirmation: "TRANSFER",
    });
    const url = await captureRedirect(() => transferWorkspaceOwnership(fd));

    expect(url).toContain("transfer-invalid");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("transfers ownership and demotes previous owner to admin", async () => {
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(memberMembership);
    prismaMock.$transaction.mockResolvedValue([]);

    const fd = makeFormData({
      workspaceId: workspace.id,
      memberId: memberMembership.id,
      confirmation: "TRANSFER",
    });
    const url = await captureRedirect(() => transferWorkspaceOwnership(fd));

    expect(url).toContain("ownership-transferred");
    // $transaction is called with an array of 3 Prisma operations
    const [txArgs] = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(Array.isArray(txArgs)).toBe(true);
    expect(txArgs).toHaveLength(3);
  });
});
