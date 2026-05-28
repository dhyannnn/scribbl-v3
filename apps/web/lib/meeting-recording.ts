import {
  EgressClient,
  EgressStatus,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  type EgressInfo,
} from "livekit-server-sdk";

export type RecordingStatus = "STARTING" | "ACTIVE" | "STOPPING" | "COMPLETED" | "FAILED";

type RecordingConfig = {
  bucket: string;
  client: EgressClient;
  endpoint: string;
  region: string;
};

export function createMeetingRecordingStorageKey({
  meetingId,
  workspaceId,
}: {
  meetingId: string;
  workspaceId: string;
}) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  return `workspaces/${workspaceId}/meetings/${meetingId}/recordings/${datePrefix}-${crypto.randomUUID()}.mp4`;
}

export function getRecordingConfig(): RecordingConfig | null {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const endpoint = process.env.RECORDINGS_S3_ENDPOINT;
  const region = process.env.RECORDINGS_S3_REGION;
  const bucket = process.env.RECORDINGS_S3_BUCKET;

  if (
    !livekitUrl ||
    !livekitApiKey ||
    !livekitApiSecret ||
    !endpoint ||
    !region ||
    !bucket ||
    !process.env.RECORDINGS_S3_ACCESS_KEY ||
    !process.env.RECORDINGS_S3_SECRET_KEY
  ) {
    return null;
  }

  return {
    bucket,
    client: new EgressClient(createLiveKitApiUrl(livekitUrl), livekitApiKey, livekitApiSecret),
    endpoint,
    region,
  };
}

export async function startRoomRecording({
  roomName,
  storageKey,
}: {
  roomName: string;
  storageKey: string;
}) {
  const config = getRecordingConfig();

  if (!config) {
    return {
      error: "Recording storage is not configured.",
      info: null,
      storageBucket: "",
    };
  }

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: storageKey,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: process.env.RECORDINGS_S3_ACCESS_KEY,
        secret: process.env.RECORDINGS_S3_SECRET_KEY,
        region: config.region,
        endpoint: config.endpoint,
        bucket: config.bucket,
        forcePathStyle: true,
        contentDisposition: `inline; filename="${storageKey.split("/").at(-1) ?? "recording.mp4"}"`,
      }),
    },
  });

  try {
    const info = await config.client.startRoomCompositeEgress(
      roomName,
      {
        file: output,
      },
      {
        layout: "grid",
      },
    );

    return {
      error: "",
      info,
      storageBucket: config.bucket,
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      info: null,
      storageBucket: config.bucket,
    };
  }
}

export async function stopRoomRecording(egressId: string) {
  const config = getRecordingConfig();

  if (!config) {
    return {
      error: "Recording storage is not configured.",
      info: null,
    };
  }

  try {
    return {
      error: "",
      info: await config.client.stopEgress(egressId),
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      info: null,
    };
  }
}

export async function getRoomRecording(egressId: string) {
  const config = getRecordingConfig();

  if (!config) {
    return {
      error: "Recording storage is not configured.",
      info: null,
    };
  }

  try {
    const [info] = await config.client.listEgress({
      egressId,
    });

    return {
      error: info ? "" : "Recording status was not found.",
      info: info ?? null,
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      info: null,
    };
  }
}

export function getRecordingStatus(info: EgressInfo): RecordingStatus {
  switch (info.status) {
    case EgressStatus.EGRESS_STARTING:
      return "STARTING";
    case EgressStatus.EGRESS_ACTIVE:
      return "ACTIVE";
    case EgressStatus.EGRESS_ENDING:
      return "STOPPING";
    case EgressStatus.EGRESS_COMPLETE:
      return "COMPLETED";
    case EgressStatus.EGRESS_FAILED:
    case EgressStatus.EGRESS_ABORTED:
    case EgressStatus.EGRESS_LIMIT_REACHED:
      return "FAILED";
    default:
      return "FAILED";
  }
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Recording request failed.";
}
