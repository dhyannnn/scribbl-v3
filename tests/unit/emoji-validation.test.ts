import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const { POST } = await import("@/app/api/chat/reactions/route");

function makeReq(body: unknown) {
  return new Request("http://localhost/api/chat/reactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// canAccessMessage always returns true for these tests
function mockAccess() {
  prismaMock.message.findFirst.mockResolvedValue({
    channel: { workspaceId: "ws-1", workspace: { members: [{ id: "m-1" }] } },
  } as never);
}

describe("POST /api/chat/reactions — emoji validation (#33)", () => {
  const user = makeUser();

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    mockAccess();
    prismaMock.messageReaction.findUnique.mockResolvedValue(null);
    prismaMock.messageReaction.create.mockResolvedValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👍" }));
    expect(res.status).toBe(401);
  });

  // Single-codepoint emoji
  it("accepts a standard single emoji (👍)", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👍" }));
    expect(res.status).toBe(200);
  });

  // Multi-codepoint ZWJ sequence that is ONE visual grapheme
  it("accepts a ZWJ family emoji (👨‍👩‍👧) as one grapheme cluster", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👨‍👩‍👧" }));
    expect(res.status).toBe(200);
  });

  // Skin-tone modifier — still one grapheme cluster
  it("accepts a skin-tone modified emoji (👍🏽)", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👍🏽" }));
    expect(res.status).toBe(200);
  });

  // Two separate emoji = two grapheme clusters → should be rejected
  it("rejects two emoji in a single string", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👍😂" }));
    expect(res.status).toBe(400);
  });

  it("rejects a plain text string", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "hello" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty emoji string", async () => {
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when user cannot access the message", async () => {
    prismaMock.message.findFirst.mockResolvedValue({
      channel: { workspaceId: "ws-1", workspace: { members: [] } },
    } as never);
    const res = await POST(makeReq({ messageId: "msg-1", emoji: "👍" }));
    expect(res.status).toBe(403);
  });
});
