import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Mock Liveblocks node SDK
const mockBroadcastEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@liveblocks/node", () => ({
  Liveblocks: function Liveblocks() {
    return { broadcastEvent: mockBroadcastEvent };
  },
}));

process.env.LIVEBLOCKS_SECRET_KEY = "test-secret";

const { broadcastWorkspaceKick } = await import("@/lib/liveblocks-kick");

describe("broadcastWorkspaceKick (#29)", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);

  beforeEach(() => {
    mockBroadcastEvent.mockReset();
    mockBroadcastEvent.mockResolvedValue(undefined);
  });

  it("broadcasts to all note rooms in the workspace", async () => {
    prismaMock.note.findMany.mockResolvedValue([{ id: "note-1" }, { id: "note-2" }] as never);
    prismaMock.channel.findMany.mockResolvedValue([] as never);
    prismaMock.meeting.findMany.mockResolvedValue([] as never);

    await broadcastWorkspaceKick(workspace.id, user.id);

    expect(mockBroadcastEvent).toHaveBeenCalledTimes(2);
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      expect.stringContaining("note-1"),
      { type: "WORKSPACE_KICK", userId: user.id },
    );
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      expect.stringContaining("note-2"),
      { type: "WORKSPACE_KICK", userId: user.id },
    );
  });

  it("broadcasts to all channel rooms in the workspace", async () => {
    prismaMock.note.findMany.mockResolvedValue([] as never);
    prismaMock.channel.findMany.mockResolvedValue([{ id: "chan-1" }] as never);
    prismaMock.meeting.findMany.mockResolvedValue([] as never);

    await broadcastWorkspaceKick(workspace.id, user.id);

    expect(mockBroadcastEvent).toHaveBeenCalledOnce();
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      expect.stringContaining("chan-1"),
      { type: "WORKSPACE_KICK", userId: user.id },
    );
  });

  it("broadcasts to all meeting chat rooms in the workspace", async () => {
    prismaMock.note.findMany.mockResolvedValue([] as never);
    prismaMock.channel.findMany.mockResolvedValue([] as never);
    prismaMock.meeting.findMany.mockResolvedValue([{ id: "mtg-1" }] as never);

    await broadcastWorkspaceKick(workspace.id, user.id);

    expect(mockBroadcastEvent).toHaveBeenCalledOnce();
    expect(mockBroadcastEvent).toHaveBeenCalledWith(
      expect.stringContaining("mtg-1"),
      { type: "WORKSPACE_KICK", userId: user.id },
    );
  });

  it("does nothing when the workspace has no rooms", async () => {
    prismaMock.note.findMany.mockResolvedValue([] as never);
    prismaMock.channel.findMany.mockResolvedValue([] as never);
    prismaMock.meeting.findMany.mockResolvedValue([] as never);

    await broadcastWorkspaceKick(workspace.id, user.id);

    expect(mockBroadcastEvent).not.toHaveBeenCalled();
  });

  it("broadcasts to notes, channels, and meetings together", async () => {
    prismaMock.note.findMany.mockResolvedValue([{ id: "note-1" }] as never);
    prismaMock.channel.findMany.mockResolvedValue([{ id: "chan-1" }] as never);
    prismaMock.meeting.findMany.mockResolvedValue([{ id: "mtg-1" }] as never);

    await broadcastWorkspaceKick(workspace.id, user.id);

    expect(mockBroadcastEvent).toHaveBeenCalledTimes(3);
  });

  it("continues broadcasting even if one room fails (Promise.allSettled)", async () => {
    prismaMock.note.findMany.mockResolvedValue([{ id: "note-1" }, { id: "note-2" }] as never);
    prismaMock.channel.findMany.mockResolvedValue([] as never);
    prismaMock.meeting.findMany.mockResolvedValue([] as never);

    // First broadcast fails, second should still be called
    mockBroadcastEvent
      .mockRejectedValueOnce(new Error("room not found"))
      .mockResolvedValueOnce(undefined);

    await expect(broadcastWorkspaceKick(workspace.id, user.id)).resolves.not.toThrow();
    expect(mockBroadcastEvent).toHaveBeenCalledTimes(2);
  });
});
