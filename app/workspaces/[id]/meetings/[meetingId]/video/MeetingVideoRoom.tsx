"use client";

import {
  DisconnectButton,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  TrackToggle,
  type TrackReference,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { MeetingVideoRecordingProps } from "./VideoPopoutShell";
import {
  markCurrentUserVideoJoined,
  markCurrentUserVideoLeft,
  startMeetingRecording,
  stopMeetingRecording,
  syncMeetingRecordingStatus,
} from "../actions";

type MeetingVideoRoomProps = {
  workspaceId: string;
  meetingId: string;
  disabled?: boolean;
  mode?: "full" | "floating";
  recording?: MeetingVideoRecordingProps;
  recordingReturnTo?: "current" | "hub" | "video";
};

type TokenResponse = {
  roomName: string;
  serverUrl: string;
  token: string;
};

export function MeetingVideoRoom({
  workspaceId,
  meetingId,
  disabled = false,
  mode = "full",
  recording,
  recordingReturnTo = "video",
}: MeetingVideoRoomProps) {
  const [connection, setConnection] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
  const [hasMarkedJoined, setHasMarkedJoined] = useState(false);
  const [isPending, startTransition] = useTransition();
  const clientSessionIdRef = useRef("");
  const connectedRef = useRef(false);
  const leaveTimeoutRef = useRef<number | null>(null);

  const markLeft = useCallback(() => {
    const clientSessionId = clientSessionIdRef.current;

    if (!connectedRef.current || !clientSessionId) {
      return;
    }

    connectedRef.current = false;
    setHasMarkedJoined(false);

    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
    }

    leaveTimeoutRef.current = window.setTimeout(() => {
      leaveTimeoutRef.current = null;
      void markCurrentUserVideoLeft(workspaceId, meetingId, clientSessionId);
    }, 1200);
  }, [meetingId, workspaceId]);

  const leaveRoom = useCallback(() => {
    markLeft();
    clientSessionIdRef.current = "";
    setConnection(null);
  }, [markLeft]);

  useEffect(() => {
    return () => {
      markLeft();
    };
  }, [markLeft]);

  async function joinRoom() {
    setError("");
    const clientSessionId = createClientSessionId();
    clientSessionIdRef.current = clientSessionId;

    try {
      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          meetingId,
          clientSessionId,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        clientSessionIdRef.current = "";
        setError(typeof payload?.error === "string" ? payload.error : "Unable to join video.");
        return;
      }

      setConnection(payload as TokenResponse);
    } catch {
      clientSessionIdRef.current = "";
      setError("Unable to reach the video service.");
    }
  }

  if (!connection) {
    return (
      <div className={getJoinSurfaceClassName(mode)}>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b7c8ba]">LiveKit Video</p>
        <h2 className={mode === "floating" ? "mt-2 text-xl font-semibold" : "mt-3 text-3xl font-semibold"}>
          Join the room
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
          Mic, camera, and screen share controls will open here.
        </p>
        {error ? (
          <p className="mt-5 rounded-md border border-[#f1c7c2] bg-[#fff7f5] px-4 py-3 text-sm text-[#7a3434]">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={disabled || isPending}
          onClick={joinRoom}
          className="mt-6 rounded-md bg-white px-5 py-2.5 text-sm font-medium text-[#20201d] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Video unavailable" : isPending ? "Joining..." : "Join Video"}
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.serverUrl}
      connect
      audio
      video
      onConnected={() => {
        if (leaveTimeoutRef.current !== null) {
          window.clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
        }

        connectedRef.current = true;
        startTransition(() => {
          void markCurrentUserVideoJoined(workspaceId, meetingId, clientSessionIdRef.current).then(() => {
            setHasMarkedJoined(true);
          });
        });
      }}
      onDisconnected={leaveRoom}
      data-lk-theme="default"
      className={getRoomClassName(mode)}
    >
      <ConferenceSurface
        workspaceId={workspaceId}
        meetingId={meetingId}
        mode={mode}
        recording={recording}
        hasJoinedVideo={hasMarkedJoined}
        recordingReturnTo={recordingReturnTo}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function createClientSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function ConferenceSurface({
  hasJoinedVideo,
  meetingId,
  mode,
  recording,
  recordingReturnTo,
  workspaceId,
}: {
  hasJoinedVideo: boolean;
  meetingId: string;
  mode: "full" | "floating";
  recording?: MeetingVideoRecordingProps;
  recordingReturnTo: "current" | "hub" | "video";
  workspaceId: string;
}) {
  const [showLocalPreview, setShowLocalPreview] = useState(false);
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const speakingParticipants = useSpeakingParticipants();
  const displayTracks = useMemo(
    () => getDisplayTracks(tracks, speakingParticipants, mode, showLocalPreview),
    [mode, showLocalPreview, speakingParticipants, tracks],
  );
  const gridClassName = getVideoGridClassName(displayTracks.length, mode);

  return (
    <div className={mode === "floating" ? "flex h-full min-h-0 flex-col bg-[#11110f]" : "flex min-h-[calc(100vh-220px)] flex-col bg-[#11110f]"}>
      <div className={gridClassName}>
        {displayTracks.length > 0 ? (
          displayTracks.map((trackRef) => (
            <ParticipantTile
              key={[
                trackRef.participant.identity,
                trackRef.source,
                trackRef.publication?.trackSid ?? "pending",
              ].join(":")}
              trackRef={trackRef}
              className={mode === "floating" ? "h-full min-h-[150px] overflow-hidden rounded-md bg-[#20201d]" : "h-full min-h-[360px] overflow-hidden rounded-md bg-[#20201d]"}
            />
          ))
        ) : (
          <div className={mode === "floating" ? "col-span-full flex min-h-[150px] items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-4 text-center" : "col-span-full flex min-h-[360px] items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-6 text-center"}>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b7c8ba]">
                {mode === "floating" ? "Waiting For Speaker" : "Connected"}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/70">
                {mode === "floating"
                  ? "Remote video will appear here when someone joins or shares."
                  : "Turn on your camera or wait for someone else to join."}
              </p>
              {mode === "floating" && tracks.some((trackRef) => trackRef.participant.isLocal) ? (
                <button
                  type="button"
                  onClick={() => setShowLocalPreview(true)}
                  className="mt-4 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  Show Preview
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
      <div className={mode === "floating" ? "flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#171713] p-2" : "flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#171713] p-3"}>
        {recording ? (
          <RecordingControls
            workspaceId={workspaceId}
            meetingId={meetingId}
            recording={recording}
            hasJoinedVideo={hasJoinedVideo}
            mode={mode}
            recordingReturnTo={recordingReturnTo}
          />
        ) : null}
        <StartMediaButton className={getControlClassName(mode)}>
          Start Media
        </StartMediaButton>
        <TrackToggle
          source={Track.Source.Microphone}
          className={getControlClassName(mode)}
        >
          Mic
        </TrackToggle>
        <TrackToggle
          source={Track.Source.Camera}
          className={getControlClassName(mode)}
        >
          Camera
        </TrackToggle>
        <TrackToggle
          source={Track.Source.ScreenShare}
          className={getControlClassName(mode)}
        >
          Share
        </TrackToggle>
        {mode === "floating" ? (
          <button
            type="button"
            onClick={() => setShowLocalPreview((value) => !value)}
            className={getControlClassName(mode)}
          >
            {showLocalPreview ? "Hide Self" : "Self"}
          </button>
        ) : null}
        <DisconnectButton className={getLeaveClassName(mode)}>
          Leave
        </DisconnectButton>
      </div>
    </div>
  );
}

function RecordingControls({
  hasJoinedVideo,
  meetingId,
  recording,
  recordingReturnTo,
  workspaceId,
  mode,
}: {
  hasJoinedVideo: boolean;
  meetingId: string;
  mode: "full" | "floating";
  recording: MeetingVideoRecordingProps;
  recordingReturnTo: "current" | "hub" | "video";
  workspaceId: string;
}) {
  const router = useRouter();
  const activeRecording = recording.activeRecording;
  const latestRecording = recording.latestRecording;
  const isRecordingMutable =
    activeRecording && ["STARTING", "ACTIVE", "STOPPING"].includes(activeRecording.status);
  const canStartRecording = recording.canManage && hasJoinedVideo && !activeRecording;
  async function submitStartRecording(formData: FormData) {
    await startMeetingRecording(formData);
    router.refresh();
  }

  async function submitStopRecording(formData: FormData) {
    await stopMeetingRecording(formData);
    router.refresh();
  }

  useEffect(() => {
    if (!isRecordingMutable) {
      return;
    }

    let isCanceled = false;
    const interval = window.setInterval(() => {
      void syncMeetingRecordingStatus({
        workspaceId,
        meetingId,
        recordingId: activeRecording.id,
      }).then((result) => {
        if (!isCanceled && result.ok) {
          router.refresh();
        }
      });
    }, 4000);

    return () => {
      isCanceled = true;
      window.clearInterval(interval);
    };
  }, [activeRecording?.id, isRecordingMutable, meetingId, router, workspaceId]);

  if (!recording.canManage && !latestRecording) {
    return null;
  }

  return (
    <div className={getRecordingControlsClassName(mode)}>
      <div>
        <p className={mode === "floating" ? "text-xs font-medium text-white" : "font-medium text-white"}>
          {getRecordingTitle(latestRecording)}
        </p>
        <p className={mode === "floating" ? "mt-1 text-xs" : "mt-1"}>
          {getRecordingDetail({
            hasJoinedVideo,
            latestRecording,
            canManage: recording.canManage,
          })}
        </p>
        {latestRecording?.errorMessage ? (
          <p className="mt-1 text-[#f1c7c2]">{latestRecording.errorMessage}</p>
        ) : null}
      </div>

      <div className={mode === "floating" ? "flex shrink-0 flex-wrap gap-2" : "flex flex-wrap gap-2"}>
        {recording.canManage && !activeRecording ? (
          <form action={submitStartRecording}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="recordingReturnTo" value={recordingReturnTo} />
            <RecordingSubmitButton disabled={!canStartRecording} mode={mode} variant="start">
              Start Recording
            </RecordingSubmitButton>
          </form>
        ) : null}

        {recording.canManage && activeRecording ? (
          <form action={submitStopRecording}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="recordingId" value={activeRecording.id} />
            <input type="hidden" name="recordingReturnTo" value={recordingReturnTo} />
            <RecordingSubmitButton disabled={activeRecording.status === "STOPPING"} mode={mode} variant="stop">
              Stop Recording
            </RecordingSubmitButton>
          </form>
        ) : null}

        {latestRecording?.file ? (
          <Link
            href={`/api/files/${latestRecording.file.id}`}
            target="_blank"
            className={getRecordingLinkClassName(mode)}
          >
            Open Recording
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function RecordingSubmitButton({
  children,
  disabled,
  mode,
  variant,
}: {
  children: ReactNode;
  disabled: boolean;
  mode: "full" | "floating";
  variant: "start" | "stop";
}) {
  const { pending } = useFormStatus();

  return (
    <button disabled={disabled || pending} className={getRecordingButtonClassName(mode, variant)}>
      {pending ? "Working..." : children}
    </button>
  );
}

function getRecordingControlsClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "flex w-full flex-col gap-2 rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/75 sm:flex-row sm:items-center sm:justify-between";
  }

  return "flex w-full flex-col gap-2 rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/75 md:flex-row md:items-center md:justify-between";
}

function getRecordingButtonClassName(mode: "full" | "floating", variant: "start" | "stop") {
  const sizeClassName = mode === "floating" ? "min-h-8 px-3 text-xs" : "min-h-10 px-4 text-sm";

  if (variant === "stop") {
    return `${sizeClassName} rounded-md border border-[#f1c7c2] bg-[#fff7f5] font-medium text-[#7a3434] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60`;
  }

  return `${sizeClassName} rounded-md bg-white font-medium text-[#20201d] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60`;
}

function getRecordingLinkClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "inline-flex min-h-8 items-center rounded-md bg-white px-3 text-xs font-medium text-[#20201d] transition hover:bg-[#eef5ef]";
  }

  return "inline-flex min-h-10 items-center rounded-md bg-white px-4 text-sm font-medium text-[#20201d] transition hover:bg-[#eef5ef]";
}

function getRecordingTitle(recording?: MeetingVideoRecordingProps["latestRecording"]) {
  switch (recording?.status) {
    case "STARTING":
      return "Recording is starting";
    case "ACTIVE":
      return "Recording live";
    case "STOPPING":
      return "Finalizing recording";
    case "COMPLETED":
      return "Recording saved";
    case "FAILED":
      return "Recording failed";
    default:
      return "Recording";
  }
}

function getRecordingDetail({
  canManage,
  hasJoinedVideo,
  latestRecording,
}: {
  canManage: boolean;
  hasJoinedVideo: boolean;
  latestRecording?: MeetingVideoRecordingProps["latestRecording"];
}) {
  if (!canManage) {
    return latestRecording ? "Recording status is visible here." : "You do not have permission to manage recording.";
  }

  if (!hasJoinedVideo) {
    return "Join video to manage recording.";
  }

  if (latestRecording?.status === "COMPLETED") {
    return "Saved to this meeting's artifacts and workspace Files.";
  }

  if (latestRecording?.status === "STOPPING") {
    return "The MP4 is being finalized and will appear automatically.";
  }

  if (latestRecording?.status === "ACTIVE") {
    return "This video room is being recorded.";
  }

  return "Start recording from this video room.";
}

function getDisplayTracks(
  tracks: TrackReference[],
  speakingParticipants: { identity: string; isLocal?: boolean }[],
  mode: "full" | "floating",
  showLocalPreview: boolean,
) {
  if (mode === "full") {
    return tracks;
  }

  const remoteTracks = tracks.filter((trackRef) => !trackRef.participant.isLocal);
  const localTracks = showLocalPreview ? tracks.filter((trackRef) => trackRef.participant.isLocal) : [];
  const remoteScreenShares = remoteTracks.filter((trackRef) => trackRef.source === Track.Source.ScreenShare);
  const remoteCameras = remoteTracks.filter((trackRef) => trackRef.source === Track.Source.Camera);
  const activeRemoteIdentities = speakingParticipants
    .filter((participant) => !participant.isLocal)
    .map((participant) => participant.identity);
  const activeCamera = remoteCameras.find((trackRef) => activeRemoteIdentities.includes(trackRef.participant.identity));
  const focusedRemoteTracks = [...remoteScreenShares, ...(activeCamera ? [activeCamera] : remoteCameras)];

  return [...dedupeTracks(focusedRemoteTracks), ...localTracks].slice(0, showLocalPreview ? 2 : 1);
}

function dedupeTracks(tracks: TrackReference[]) {
  const seen = new Set<string>();

  return tracks.filter((trackRef) => {
    const key = `${trackRef.participant.identity}:${trackRef.source}:${trackRef.publication.trackSid}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getJoinSurfaceClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "flex h-full min-h-[260px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-4 text-center text-white";
  }

  return "flex min-h-[420px] flex-col items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-6 text-center text-white";
}

function getRoomClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "h-full min-h-0 overflow-hidden rounded-md border border-white/10 bg-[#11110f]";
  }

  return "min-h-[calc(100vh-220px)] overflow-hidden rounded-md border border-white/10 bg-[#11110f]";
}

function getVideoGridClassName(trackCount: number, mode: "full" | "floating") {
  const baseClassName =
    mode === "floating"
      ? "grid min-h-0 flex-1 gap-2 overflow-auto p-2"
      : "grid flex-1 gap-3 overflow-auto p-3";

  if (trackCount <= 1) {
    return `${baseClassName} grid-cols-1`;
  }

  if (trackCount === 2) {
    return `${baseClassName} grid-cols-1 lg:grid-cols-2`;
  }

  if (trackCount <= 4) {
    return `${baseClassName} grid-cols-1 sm:grid-cols-2`;
  }

  return `${baseClassName} grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`;
}

function getControlClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20";
  }

  return "rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20";
}

function getLeaveClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "rounded-md border border-[#f1c7c2] bg-[#fff7f5] px-3 py-1.5 text-xs font-medium text-[#7a3434] transition hover:bg-white";
  }

  return "rounded-md border border-[#f1c7c2] bg-[#fff7f5] px-4 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-white";
}
