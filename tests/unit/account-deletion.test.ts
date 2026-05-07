import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData, captureRedirect } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/lib/rate-limit", () => ({
  RateLimits: {
    accountDelete: vi.fn(() => true),
    passwordUpdate: vi.fn(() => true),
  },
}));

const mockGetCurrentUser = vi.fn();
const mockGetSupabaseAuthUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  getSupabaseAuthUser: () => mockGetSupabaseAuthUser(),
}));

const mockDeleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: { user: { email: "test@test.com" } }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  })),
}));

const { deleteAccount } = await import("@/app/account/actions");

describe("deleteAccount", () => {
  const user = makeUser();
  const authUser = { id: user.authUserId };
  const workspace = makeWorkspace(user.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockGetSupabaseAuthUser.mockResolvedValue(authUser);
    mockDeleteUser.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-secret";
  });

  it("redirects unauthenticated users to login", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    mockGetSupabaseAuthUser.mockResolvedValue(null);

    const fd = makeFormData({ confirmation: "DELETE" });
    const url = await captureRedirect(() => deleteAccount(fd));

    expect(url).toContain("/login");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("requires exact DELETE confirmation", async () => {
    const fd = makeFormData({ confirmation: "delete" }); // wrong case
    const url = await captureRedirect(() => deleteAccount(fd));

    expect(url).toContain("Type DELETE to confirm");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("blocks deletion when user owns an active workspace", async () => {
    const ownedMembership = {
      ...makeMembership(workspace.id, user.id, { role: "OWNER" }),
      workspace: { name: workspace.name },
    };
    prismaMock.workspaceMember.findFirst.mockResolvedValue(ownedMembership as never);

    const fd = makeFormData({ confirmation: "DELETE" });
    const url = await captureRedirect(() => deleteAccount(fd));

    expect(decodeURIComponent(url)).toContain("Account deletion is blocked");
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rolls back deletionRequestedAt if Supabase auth deletion fails", async () => {
    prismaMock.workspaceMember.findFirst.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue(user as never);
    mockDeleteUser.mockResolvedValue({ error: { message: "Auth deletion failed" } });

    const fd = makeFormData({ confirmation: "DELETE" });
    const url = await captureRedirect(() => deleteAccount(fd));

    // Should have set deletionRequestedAt then cleared it on failure
    expect(prismaMock.user.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ deletionRequestedAt: null }) }),
    );
    expect(decodeURIComponent(url)).toContain("Auth deletion failed");
  });

  it("anonymizes user and removes memberships on successful deletion", async () => {
    prismaMock.workspaceMember.findFirst.mockResolvedValue(null);
    prismaMock.user.update.mockResolvedValue(user as never);
    prismaMock.$transaction.mockResolvedValue([]);

    const fd = makeFormData({ confirmation: "DELETE" });
    const url = await captureRedirect(() => deleteAccount(fd));

    expect(mockDeleteUser).toHaveBeenCalledWith(authUser.id);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(url).toContain("/login");
  });
});
