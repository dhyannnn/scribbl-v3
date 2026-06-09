import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { makeUser, makeWorkspace, makeMembership } from "../helpers/factories";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/meeting-video-session", () => ({
  isValidClientSessionId: vi.fn(() => true),
}));

const capturedTokenOptions: unknown[] = [];
vi.mock("livekit-server-sdk", () => ({
  AccessToken: function AccessToken(this: Record<string, unknown>, _apiKey: string, _apiSecret: string, opts: unknown) {
    capturedTokenOptions.push(opts);
    this.addGrant = vi.fn();
    this.toJwt = vi.fn().mockResolvedValue("mock-jwt");
  },
  RoomServiceClient: function RoomServiceClient(this: Record<string, unknown>) {
    this.removeParticipant = vi.fn().mockResolvedValue(undefined);
  },
  TrackSource: { CAMERA: "camera", MICROPHONE: "microphone", SCREEN_SHARE: "screen_share", SCREEN_SHARE_AUDIO: "screen_share_audio" },
}));

vi.mock("@/lib/livekit-room", () => ({
  createLiveKitMeetingRoomName: vi.fn((id: string) => `room-${id}`),
}));

vi.mock("@/lib/meeting-lifecycle", () => ({
  canJoinMeeting: vi.fn(() => true),
  getMeetingLifecycle: vi.fn(() => "active"),
}));

vi.mock("@/lib/meeting-permissions", () => ({
  canModerateMeeting: vi.fn(() => true),
  getMeetingVideoPermissions: vi.fn(() => ({
    canUseCamera: true,
    canUseMic: true,
    canShareScreen: false,
    canSendReactions: true,
    canRaiseHand: true,
    canModerateVideo: false,
  })),
}));

process.env.LIVEKIT_URL = "wss://livekit.test";
process.env.LIVEKIT_API_KEY = "key";
process.env.LIVEKIT_API_SECRET = "secret";

const { POST } = await import("@/app/api/livekit-token/route");

function lastTtl() {
  const opts = capturedTokenOptions.at(-1) as { ttl?: number } | undefined;
  return opts?.ttl;
}

function makeBody(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/livekit-token", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: "ws-1",
      meetingId: "mtg-1",
      clientSessionId: "sess-1",
      ...overrides,
    }),
  });
}

function makeMeetingRow(user: ReturnType<typeof makeUser>, workspace: ReturnType<typeof makeWorkspace>, overrides: Record<string, unknown> = {}) {
  return {
    id: "mtg-1",
    createdByUserId: user.id,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: null,
    canceledAt: null,
    waitingRoom: false,
    moderationSettings: null,
    permissionOverrides: [],
    participants: [{ id: "part-1" }],
    workspace: {
      members: [makeMembership(workspace.id, user.id, { role: "OWNER" })],
    },
    ...overrides,
  };
}

describe("POST /api/livekit-token — TTL (#7)", () => {
  const user = makeUser();
  const workspace = makeWorkspace(user.id);

  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(user);
    prismaMock.meetingVideoSession.findFirst.mockResolvedValue(null);
    capturedTokenOptions.length = 0;
  });

  it("uses 2h fallback TTL when meeting has no endsAt", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(
      makeMeetingRow(user, workspace, { endsAt: null }) as never,
    );

    await POST(makeBody());

    expect(lastTtl()).toBe(7200);
  });

  it("computes TTL from meeting end time when endsAt is set", async () => {
    const endsAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    prismaMock.meeting.findFirst.mockResolvedValue(
      makeMeetingRow(user, workspace, { endsAt }) as never,
    );

    await POST(makeBody());

    // 30 min remaining + 15 min buffer = ~2700s. Allow ±30s for test timing.
    expect(lastTtl()).toBeGreaterThanOrEqual(2670);
    expect(lastTtl()).toBeLessThanOrEqual(2730);
  });

  it("enforces minimum 5 min TTL when meeting is nearly over", async () => {
    const endsAt = new Date(Date.now() + 10_000); // 10 seconds remaining
    prismaMock.meeting.findFirst.mockResolvedValue(
      makeMeetingRow(user, workspace, { endsAt }) as never,
    );

    await POST(makeBody());

    expect(lastTtl()).toBe(300); // minimum 5 min
  });

  it("enforces minimum 5 min TTL when meeting has already ended", async () => {
    const endsAt = new Date(Date.now() - 5 * 60 * 1000); // ended 5 min ago
    prismaMock.meeting.findFirst.mockResolvedValue(
      makeMeetingRow(user, workspace, { endsAt }) as never,
    );

    await POST(makeBody());

    expect(lastTtl()).toBe(300);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await POST(makeBody());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not a participant", async () => {
    prismaMock.meeting.findFirst.mockResolvedValue(
      makeMeetingRow(user, workspace, { participants: [] }) as never,
    );
    const res = await POST(makeBody());
    expect(res.status).toBe(403);
  });
});
