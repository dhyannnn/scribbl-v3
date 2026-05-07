import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeInvite, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getSupabaseAuthUser: vi.fn(),
}));

vi.mock("@/lib/email/workspace-invites", () => ({
  sendWorkspaceInviteEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/email/invite-accepted", () => ({
  sendWorkspaceInviteAcceptedEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/app-url", () => ({
  createAppUrl: vi.fn(async (path: string) => `http://localhost:3000${path}`),
}));

const { revokeWorkspaceInvite, resendWorkspaceInvite } = await import("@/app/workspaces/[id]/actions");
const { acceptWorkspaceInvite } = await import("@/app/invites/actions");

describe("revokeWorkspaceInvite", () => {
  const owner = makeUser();
  const member = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });
  const invite = makeInvite(workspace.id, owner.id);

  it("blocks non-owners from revoking invites", async () => {
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { role: "MEMBER" }),
    );
    prismaMock.workspaceInvite.findFirst.mockResolvedValue(invite);

    const fd = makeFormData({ workspaceId: workspace.id, inviteId: invite.id });
    await revokeWorkspaceInvite(fd);

    expect(prismaMock.workspaceInvite.update).not.toHaveBeenCalled();
  });

  it("only revokes pending invites", async () => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    // findFirst returns null — invite is already accepted/revoked
    prismaMock.workspaceInvite.findFirst.mockResolvedValue(null);

    const fd = makeFormData({ workspaceId: workspace.id, inviteId: invite.id });
    await revokeWorkspaceInvite(fd);

    expect(prismaMock.workspaceInvite.update).not.toHaveBeenCalled();
  });

  it("allows owner to revoke a pending invite", async () => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);
    prismaMock.workspaceInvite.findFirst.mockResolvedValue(invite);
    prismaMock.workspaceInvite.update.mockResolvedValue({ ...invite, status: "REVOKED" });

    const fd = makeFormData({ workspaceId: workspace.id, inviteId: invite.id });
    await revokeWorkspaceInvite(fd);

    expect(prismaMock.workspaceInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REVOKED" }) }),
    );
  });
});

describe("acceptWorkspaceInvite", () => {
  const inviter = makeUser();
  const invitee = makeUser();
  const workspace = makeWorkspace(inviter.id);
  const ownerMembership = makeMembership(workspace.id, inviter.id, { role: "OWNER" });

  const makeFullInvite = (overrides = {}) => ({
    ...makeInvite(workspace.id, inviter.id, { email: invitee.email }),
    workspace: {
      name: workspace.name,
      members: [{ user: { email: inviter.email } }],
    },
    ...overrides,
  });

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(invitee);
  });

  it("redirects unauthenticated users to login", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const invite = makeFullInvite();
    prismaMock.workspaceInvite.findUnique.mockResolvedValue(invite as never);

    const fd = makeFormData({ token: invite.token });
    const url = await captureRedirect(() => acceptWorkspaceInvite(fd));

    expect(url).toContain("/login");
  });

  it("silently ignores revoked invites", async () => {
    const invite = makeFullInvite({ status: "REVOKED" });
    prismaMock.workspaceInvite.findUnique.mockResolvedValue(invite as never);

    const fd = makeFormData({ token: invite.token });
    const url = await captureRedirect(() => acceptWorkspaceInvite(fd));

    // Redirects to workspace without creating membership
    expect(url).toContain(`/workspaces/${workspace.id}`);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("expires and rejects an expired invite", async () => {
    const invite = makeFullInvite({ expiresAt: new Date(Date.now() - 1000) });
    prismaMock.workspaceInvite.findUnique.mockResolvedValue(invite as never);
    prismaMock.workspaceInvite.update.mockResolvedValue({ ...invite, status: "EXPIRED" });

    const fd = makeFormData({ token: invite.token });
    await acceptWorkspaceInvite(fd);

    expect(prismaMock.workspaceInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "EXPIRED" }) }),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks acceptance if invite email doesn't match current user", async () => {
    const otherUser = makeUser({ email: "other@test.com" });
    mockGetCurrentUser.mockResolvedValue(otherUser);
    const invite = makeFullInvite(); // email is invitee.email, not other@test.com
    prismaMock.workspaceInvite.findUnique.mockResolvedValue(invite as never);

    const fd = makeFormData({ token: invite.token });
    await acceptWorkspaceInvite(fd);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does not duplicate membership on re-acceptance", async () => {
    const invite = makeFullInvite();
    prismaMock.workspaceInvite.findUnique.mockResolvedValue(invite as never);

    const existingMembership = makeMembership(workspace.id, invitee.id);
    prismaMock.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") {
        // Simulate existing membership found
        prismaMock.workspaceMember.findUnique.mockResolvedValue(existingMembership);
        prismaMock.workspaceMember.update.mockResolvedValue({ ...existingMembership, status: "ACTIVE" });
        prismaMock.meeting.findMany.mockResolvedValue([]);
        prismaMock.workspaceInvite.update.mockResolvedValue({ ...invite, status: "ACCEPTED" });
        await fn(prismaMock);
      }
    });

    const fd = makeFormData({ token: invite.token });
    await captureRedirect(() => acceptWorkspaceInvite(fd));

    expect(prismaMock.workspaceMember.update).toHaveBeenCalled();
    expect(prismaMock.workspaceMember.create).not.toHaveBeenCalled();
  });
});

describe("resendWorkspaceInvite", () => {
  const owner = makeUser();
  const workspace = makeWorkspace(owner.id);
  const ownerMembership = makeMembership(workspace.id, owner.id, { role: "OWNER" });

  it("blocks non-owners from resending invites", async () => {
    const member = makeUser();
    mockGetCurrentUser.mockResolvedValue(member);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, member.id, { role: "MEMBER" }),
    );

    const invite = makeInvite(workspace.id, owner.id);
    const fd = makeFormData({ workspaceId: workspace.id, inviteId: invite.id });
    await resendWorkspaceInvite(fd);

    expect(prismaMock.workspaceInvite.update).not.toHaveBeenCalled();
  });

  it("refreshes token and expiry on resend", async () => {
    mockGetCurrentUser.mockResolvedValue(owner);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(ownerMembership);

    const invite = {
      ...makeInvite(workspace.id, owner.id),
      workspace: { name: workspace.name },
    };
    prismaMock.workspaceInvite.findFirst.mockResolvedValue(invite as never);
    prismaMock.workspaceInvite.update.mockResolvedValue(invite as never);

    const fd = makeFormData({ workspaceId: workspace.id, inviteId: invite.id });
    await captureRedirect(() => resendWorkspaceInvite(fd));

    expect(prismaMock.workspaceInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          token: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      }),
    );
  });
});
