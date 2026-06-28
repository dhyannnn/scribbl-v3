import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getCurrentMobileUser: vi.fn(),
  isValidClientSessionId: vi.fn(() => true),
  startMeetingVideoSession: vi.fn(),
  endMeetingVideoSession: vi.fn(),
  canModerateMeeting: vi.fn(() => true),
  getMeetingVideoPermissions: vi.fn(() => ({
    canUseCamera: true,
    canUseMic: true,
    canShareScreen: true,
    canSendReactions: true,
    canRaiseHand: true,
    canModerateVideo: false,
  })),
  tokenOptions: [] as unknown[],
  tokenGrants: [] as unknown[],
  removeParticipant: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mocks.getCurrentUser(),
}));

vi.mock("@/lib/mobile-auth", () => ({
  getCurrentMobileUser: (request: Request) => mocks.getCurrentMobileUser(request),
}));

vi.mock("@/lib/meeting-video-session", () => ({
  isValidClientSessionId: (clientSessionId: string) =>
    (mocks.isValidClientSessionId as unknown as (value: string) => boolean)(clientSessionId),
  startMeetingVideoSession: (input: unknown) =>
    (mocks.startMeetingVideoSession as unknown as (value: unknown) => unknown)(input),
  endMeetingVideoSession: (input: unknown) =>
    (mocks.endMeetingVideoSession as unknown as (value: unknown) => unknown)(input),
}));

vi.mock("@/lib/livekit-room", () => ({
  createLiveKitMeetingRoomName: (id: string) => `room-${id}`,
}));

vi.mock("@/lib/meeting-lifecycle", () => ({
  canJoinMeeting: vi.fn(() => true),
  getMeetingLifecycle: vi.fn(() => "active"),
}));

vi.mock("@/lib/meeting-permissions", () => ({
  canModerateMeeting: (input: unknown) =>
    (mocks.canModerateMeeting as unknown as (value: unknown) => boolean)(input),
  getMeetingVideoPermissions: (input: unknown) =>
    (mocks.getMeetingVideoPermissions as unknown as (value: unknown) => Record<string, boolean>)(input),
}));

vi.mock("livekit-server-sdk", () => ({
  AccessToken: function AccessToken(this: Record<string, unknown>, _apiKey: string, _apiSecret: string, opts: unknown) {
    mocks.tokenOptions.push(opts);
    this.addGrant = vi.fn((grant: unknown) => mocks.tokenGrants.push(grant));
    this.toJwt = vi.fn().mockResolvedValue("mock-jwt");
  },
  RoomServiceClient: function RoomServiceClient(this: Record<string, unknown>) {
    this.removeParticipant = mocks.removeParticipant;
  },
  TrackSource: {
    CAMERA: "camera",
    MICROPHONE: "microphone",
    SCREEN_SHARE: "screen_share",
    SCREEN_SHARE_AUDIO: "screen_share_audio",
  },
}));

process.env.LIVEKIT_URL = "wss://livekit.test";
process.env.LIVEKIT_API_KEY = "key";
process.env.LIVEKIT_API_SECRET = "secret";

const webTokenRoute = await import("@/app/api/livekit-token/route");
const mobileTokenRoute = await import("@/app/api/mobile/meetings/[meetingId]/livekit-token/route");
const mobileSessionRoute = await import("@/app/api/mobile/meetings/[meetingId]/video-session/route");

const user = {
  id: "user-1",
  displayName: "Test User",
  avatarUrl: null,
  status: "ONLINE",
  previousStatus: null,
};

const basePermissions = {
  canUseCamera: true,
  canUseMic: true,
  canShareScreen: true,
  canSendReactions: true,
  canRaiseHand: true,
  canModerateVideo: false,
};

function makeMeeting(overrides: Record<string, unknown> = {}) {
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
      members: [{ id: "member-1", role: "MEMBER" }],
    },
    ...overrides,
  };
}

function webTokenRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/livekit-token", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: "ws-1",
      meetingId: "mtg-1",
      clientSessionId: "client-session-1",
      ...overrides,
    }),
  });
}

function mobileTokenRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/mobile/meetings/mtg-1/livekit-token", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: "ws-1",
      clientSessionId: "client-session-1",
      ...overrides,
    }),
  });
}

function mobileSessionRequest(attendance: "joined" | "left") {
  return new Request("http://localhost/api/mobile/meetings/mtg-1/video-session", {
    method: "POST",
    body: JSON.stringify({
      workspaceId: "ws-1",
      clientSessionId: "client-session-1",
      attendance,
    }),
  });
}

const mobileContext = {
  params: Promise.resolve({ meetingId: "mtg-1" }),
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("meeting video web/mobile compatibility", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getCurrentMobileUser.mockResolvedValue(user);
    mocks.isValidClientSessionId.mockReturnValue(true);
    mocks.canModerateMeeting.mockReturnValue(true);
    mocks.getMeetingVideoPermissions.mockReturnValue(basePermissions);
    mocks.startMeetingVideoSession.mockResolvedValue({ ok: true });
    mocks.endMeetingVideoSession.mockResolvedValue({ ok: true });
    mocks.tokenOptions.length = 0;
    mocks.tokenGrants.length = 0;
    mocks.removeParticipant.mockResolvedValue(undefined);
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeeting() as never);
    prismaMock.meetingVideoSession.findFirst.mockResolvedValue(null);
    prismaMock.meetingAdmission.findUnique.mockResolvedValue(null);
    prismaMock.meetingWaitingUser.upsert.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue(user as never);
  });

  it("returns the same LiveKit success response shape from web and mobile token routes", async () => {
    const webResponse = await webTokenRoute.POST(webTokenRequest());
    const mobileResponse = await mobileTokenRoute.POST(mobileTokenRequest(), mobileContext);

    expect(webResponse.status).toBe(200);
    expect(mobileResponse.status).toBe(200);

    const webBody = await json(webResponse);
    const mobileBody = await json(mobileResponse);

    for (const body of [webBody, mobileBody]) {
      expect(body).toMatchObject({
        roomName: "room-mtg-1",
        serverUrl: "wss://livekit.test",
        token: "mock-jwt",
        permissions: basePermissions,
      });
      expect(body).not.toHaveProperty("waiting");
      expect(body).not.toHaveProperty("conflict");
    }
  });

  it("keeps waiting-room admission responses compatible across web and mobile token routes", async () => {
    mocks.canModerateMeeting.mockReturnValue(false);
    prismaMock.meeting.findFirst.mockResolvedValue(makeMeeting({ waitingRoom: true }) as never);
    prismaMock.meetingAdmission.findUnique.mockResolvedValue(null);

    const webResponse = await webTokenRoute.POST(webTokenRequest());
    const mobileResponse = await mobileTokenRoute.POST(mobileTokenRequest(), mobileContext);

    expect(webResponse.status).toBe(200);
    expect(mobileResponse.status).toBe(200);
    expect(await json(webResponse)).toEqual({ waiting: true });
    expect(await json(mobileResponse)).toEqual({ waiting: true });
    expect(prismaMock.meetingWaitingUser.upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps same-user multi-device conflicts and force-join behavior compatible", async () => {
    prismaMock.meetingVideoSession.findFirst.mockResolvedValue({ id: "old-session" } as never);

    const webConflict = await webTokenRoute.POST(webTokenRequest());
    const mobileConflict = await mobileTokenRoute.POST(mobileTokenRequest(), mobileContext);

    expect(webConflict.status).toBe(409);
    expect(mobileConflict.status).toBe(409);
    expect(await json(webConflict)).toEqual({
      conflict: true,
      error: "You are already in this meeting from another device.",
    });
    expect(await json(mobileConflict)).toEqual({
      conflict: true,
      error: "You are already in this meeting from another device.",
    });

    const webForced = await webTokenRoute.POST(webTokenRequest({ force: true }));
    const mobileForced = await mobileTokenRoute.POST(mobileTokenRequest({ force: true }), mobileContext);

    expect(webForced.status).toBe(200);
    expect(mobileForced.status).toBe(200);
    expect(mocks.removeParticipant).toHaveBeenCalledWith("room-mtg-1", user.id);
    expect(mocks.removeParticipant).toHaveBeenCalledTimes(2);
  });

  it("tracks mobile join and leave sessions through the shared session helpers", async () => {
    const joined = await mobileSessionRoute.POST(mobileSessionRequest("joined"), mobileContext);
    const left = await mobileSessionRoute.POST(mobileSessionRequest("left"), mobileContext);

    expect(joined.status).toBe(200);
    expect(left.status).toBe(200);
    expect(await json(joined)).toEqual({ ok: true });
    expect(await json(left)).toEqual({ ok: true });
    expect(mocks.startMeetingVideoSession).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      meetingId: "mtg-1",
      userId: user.id,
      clientSessionId: "client-session-1",
    });
    expect(mocks.endMeetingVideoSession).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      meetingId: "mtg-1",
      userId: user.id,
      clientSessionId: "client-session-1",
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { status: "IN_MEETING", previousStatus: "ONLINE" },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { status: "ONLINE", previousStatus: null },
    });
  });
});
