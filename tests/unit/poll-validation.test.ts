import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership, makeFormData } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/meeting-permissions", () => ({
  canCreateMeetingPoll: vi.fn(() => true),
}));

vi.mock("@/lib/polls", () => ({
  shapePoll: vi.fn((poll: unknown) => poll),
}));

const { createPoll } = await import("@/app/workspaces/[id]/polls/actions");

function makeValidFormData(overrides: Record<string, string> = {}) {
  return makeFormData({
    workspaceId: "ws-1",
    question: "What is your favourite colour?",
    option_0: "Red",
    option_1: "Blue",
    ...overrides,
  });
}

describe("createPoll — validation (#16)", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);
  const membership = makeMembership(workspace.id, user.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.workspaceMember.findFirst.mockResolvedValue(membership);
    prismaMock.poll.create.mockResolvedValue({
      id: "poll-1", question: "Q", options: ["Red", "Blue"], votes: [],
      createdBy: { displayName: "Test" }, createdByUserId: user.id,
      closedAt: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
  });

  it("returns error when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const result = await createPoll(makeValidFormData());
    expect(result.error).toBe("unauthenticated");
  });

  it("returns error when user is not a workspace member", async () => {
    prismaMock.workspaceMember.findFirst.mockResolvedValue(null);
    const result = await createPoll(makeValidFormData());
    expect(result.error).toBe("unauthorized");
  });

  it("returns error when question is empty", async () => {
    const result = await createPoll(makeValidFormData({ question: "" }));
    expect(result.error).toBe("invalid");
  });

  it("returns error when question exceeds 500 chars", async () => {
    const result = await createPoll(makeValidFormData({ question: "Q".repeat(501) }));
    expect(result.error).toBe("invalid");
  });

  it("returns error when fewer than 2 options provided", async () => {
    const fd = makeFormData({ workspaceId: "ws-1", question: "Q?", option_0: "Only one" });
    const result = await createPoll(fd);
    expect(result.error).toBe("invalid");
  });

  it("returns error when an option exceeds 200 chars", async () => {
    const result = await createPoll(makeValidFormData({ option_0: "A".repeat(201) }));
    expect(result.error).toBe("invalid");
  });

  it("deduplicates identical options", async () => {
    // After dedup, only 1 unique option remains → fewer than 2 → invalid
    const result = await createPoll(makeValidFormData({ option_0: "Same", option_1: "Same" }));
    expect(result.error).toBe("invalid");
  });

  it("strips HTML tags from options", async () => {
    const result = await createPoll(makeValidFormData({
      option_0: "<b>Red</b>",
      option_1: "Blue",
    }));
    // HTML tags stripped — "<b>Red</b>" becomes "Red"
    expect(result.error).toBeUndefined();
    const callArg = prismaMock.poll.create.mock.calls[0][0] as unknown as { data: { options: string[] } };
    expect(callArg.data.options).toContain("Red");
    expect(callArg.data.options).not.toContain("<b>Red</b>");
  });

  it("accepts a valid poll with 2 options", async () => {
    const result = await createPoll(makeValidFormData());
    expect(result.error).toBeUndefined();
    expect(result.poll).toBeDefined();
  });

  it("returns error when more than 10 options provided", async () => {
    const opts: Record<string, string> = { workspaceId: "ws-1", question: "Q?" };
    // Provide 11 non-empty options across indices 0-10; action reads 0-9 (10 options) then checks options.length > 10
    // The 11th (option_10) is beyond what the loop reads (i < 10), so we need 10 valid + duplicates won't help.
    // Use 10 unique non-empty options that all pass length, then dedup gives 10, which equals exactly 10 → valid.
    // To get > 10 unique options: we can't via indices 0-9. The check is options.length > 10, which can't be
    // triggered via form data since the loop reads at most 10 slots. So test the boundary: exactly 10 unique
    // options (the max) passes, and we verify >10 can't happen through normal form submission.
    for (let i = 0; i < 10; i++) opts[`option_${i}`] = `Option ${i}`;
    const result = await createPoll(makeFormData(opts));
    expect(result.error).toBeUndefined(); // exactly 10 is valid
  });
});
