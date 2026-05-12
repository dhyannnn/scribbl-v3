import { RoomServiceClient, TrackSource, type ParticipantPermission } from "livekit-server-sdk";
import { logger } from "@/lib/logger";
import type { MeetingVideoPermissions } from "@/lib/meeting-permissions";

type LiveKitAdminConfig = {
  client: RoomServiceClient;
};

export function getLiveKitAdminConfig(): LiveKitAdminConfig | null {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return null;
  }

  return {
    client: new RoomServiceClient(createLiveKitApiUrl(livekitUrl), livekitApiKey, livekitApiSecret),
  };
}

export function toLiveKitParticipantPermission(
  permissions: MeetingVideoPermissions,
): Partial<ParticipantPermission> {
  const canPublishSources = getAllowedPublishSources(permissions);

  return {
    canPublish: canPublishSources.length > 0,
    canPublishData:
      permissions.canSendReactions || permissions.canRaiseHand || permissions.canModerateVideo,
    canPublishSources,
    canSubscribe: true,
  };
}

export async function enforceLiveKitVideoPermissions({
  identity,
  permissions,
  roomName,
}: {
  identity: string;
  permissions: MeetingVideoPermissions;
  roomName: string;
}) {
  const config = getLiveKitAdminConfig();

  if (!config) {
    return;
  }

  try {
    await config.client.updateParticipant(roomName, identity, {
      permission: toLiveKitParticipantPermission(permissions),
    });

    const participant = await config.client.getParticipant(roomName, identity);
    const deniedSources = getDeniedTrackSources(permissions);
    const tracksToMute = participant.tracks.filter((track) => deniedSources.has(track.source));

    await Promise.all(
      tracksToMute.map((track) => config.client.mutePublishedTrack(roomName, identity, track.sid, true)),
    );
  } catch (error) {
    logger.livekitError(
      {
        identity,
        roomName,
        operation: "enforce-video-permissions",
      },
      error,
    );
  }
}

function getAllowedPublishSources(permissions: MeetingVideoPermissions) {
  return [
    permissions.canUseCamera ? TrackSource.CAMERA : null,
    permissions.canUseMic ? TrackSource.MICROPHONE : null,
    permissions.canShareScreen ? TrackSource.SCREEN_SHARE : null,
    permissions.canShareScreen ? TrackSource.SCREEN_SHARE_AUDIO : null,
  ].filter((source): source is TrackSource => source !== null);
}

function getDeniedTrackSources(permissions: MeetingVideoPermissions) {
  const deniedSources = new Set<TrackSource>();

  if (!permissions.canUseCamera) {
    deniedSources.add(TrackSource.CAMERA);
  }

  if (!permissions.canUseMic) {
    deniedSources.add(TrackSource.MICROPHONE);
  }

  if (!permissions.canShareScreen) {
    deniedSources.add(TrackSource.SCREEN_SHARE);
    deniedSources.add(TrackSource.SCREEN_SHARE_AUDIO);
  }

  return deniedSources;
}

function createLiveKitApiUrl(livekitUrl: string) {
  if (livekitUrl.startsWith("wss://")) {
    return `https://${livekitUrl.slice("wss://".length)}`;
  }

  if (livekitUrl.startsWith("ws://")) {
    return `http://${livekitUrl.slice("ws://".length)}`;
  }

  return livekitUrl;
}
