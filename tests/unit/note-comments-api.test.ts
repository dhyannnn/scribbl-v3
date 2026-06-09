import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { GET: getComments } = await import("@/app/api/notes/[noteId]/comments/route");
const { GET: getSnapshots } = await import("@/app/api/notes/[noteId]/snapshots/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParams(noteId: string) {
  return { params: Promise.resolve({ noteId }) };
}

function makeRequest() {
  return new Request("http://localhost/api/notes/note-1/comments");
}

// ── Comments endpoint (#1) ────────────────────────────────────────────────────

describe("GET /api/notes/[noteId]/comments", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);
  const membership = makeMembership(workspace.id, user.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when note does not exist", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when note has no workspaceId", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: null } as never);
    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not an active workspace member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: workspace.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, user.id, { status: "REMOVED" }),
    );
    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(403);
  });

  it("returns 403 when user has no membership record", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: workspace.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(null);
    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(403);
  });

  it("returns comments for an active member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: workspace.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(membership);
    prismaMock.noteComment.findMany.mockResolvedValue([
      { id: "c1", commentId: "cid-1", text: "hello", resolvedAt: null, parentCommentId: null, createdAt: new Date(), user: { displayName: "Test User" } },
    ] as never);

    const res = await getComments(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].text).toBe("hello");
  });
});

// ── Snapshots endpoint (#2) ───────────────────────────────────────────────────

describe("GET /api/notes/[noteId]/snapshots", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);
  const membership = makeMembership(workspace.id, user.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await getSnapshots(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when note does not exist", async () => {
    prismaMock.note.findFirst.mockResolvedValue(null);
    const res = await getSnapshots(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not an active workspace member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: workspace.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(
      makeMembership(workspace.id, user.id, { status: "REMOVED" }),
    );
    const res = await getSnapshots(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(403);
  });

  it("returns snapshots for an active member", async () => {
    prismaMock.note.findFirst.mockResolvedValue({ workspaceId: workspace.id } as never);
    prismaMock.workspaceMember.findUnique.mockResolvedValue(membership);
    prismaMock.noteSnapshot.findMany.mockResolvedValue([
      { id: "s1", createdAt: new Date(), user: { displayName: "Test User" } },
    ] as never);

    const res = await getSnapshots(makeRequest(), makeParams("note-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });
});
