import { TrackSource } from "livekit-server-sdk";
import { describe, expect, it } from "vitest";
import { toLiveKitParticipantPermission } from "@/lib/livekit-admin";

describe("toLiveKitParticipantPermission", () => {
  it("allows only permitted media sources", () => {
    expect(
      toLiveKitParticipantPermission({
        canUseMic: true,
        canUseCamera: false,
        canShareScreen: false,
        canSendReactions: false,
        canRaiseHand: true,
        canModerateVideo: false,
      }),
    ).toEqual({
      canPublish: true,
      canPublishData: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
    });
  });

  it("disables publishing when every media source is blocked", () => {
    expect(
      toLiveKitParticipantPermission({
        canUseMic: false,
        canUseCamera: false,
        canShareScreen: false,
        canSendReactions: false,
        canRaiseHand: false,
        canModerateVideo: false,
      }),
    ).toEqual({
      canPublish: false,
      canPublishData: false,
      canPublishSources: [],
      canSubscribe: true,
    });
  });

  it("includes screen share audio with screen share video", () => {
    expect(
      toLiveKitParticipantPermission({
        canUseMic: false,
        canUseCamera: false,
        canShareScreen: true,
        canSendReactions: false,
        canRaiseHand: false,
        canModerateVideo: false,
      }).canPublishSources,
    ).toEqual([TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]);
  });
});
