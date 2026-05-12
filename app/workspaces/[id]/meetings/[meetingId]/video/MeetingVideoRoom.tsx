"use client";

import {
  DisconnectButton,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartMediaButton,
  TrackToggle,
  type TrackReference,
  useDataChannel,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useSpeakingParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

// ── Emoji reactions ───────────────────────────────────────────────────────────

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👏", "🔥"] as const;
const REACTION_TOPIC = "emoji-reaction";
const REACTION_DURATION_MS = 3500;

type EmojiReaction = { id: string; emoji: string; sender: string; x: number };

function useEmojiReactions() {
  const [reactions, setReactions] = useState<EmojiReaction[]>([]);

  const addReaction = useCallback((emoji: string, sender: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const x = 5 + Math.random() * 75;
    setReactions((prev) => [...prev, { id, emoji, sender, x }]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), REACTION_DURATION_MS);
  }, []);

  const { send } = useDataChannel(REACTION_TOPIC, (msg) => {
    try {
      const { emoji } = JSON.parse(new TextDecoder().decode(msg.payload)) as { emoji: string };
      if (typeof emoji === "string") addReaction(emoji, msg.from?.name ?? "Someone");
    } catch { /* malformed payload */ }
  });

  const sendReaction = useCallback(
    (emoji: string) => {
      addReaction(emoji, "You");
      void send(new TextEncoder().encode(JSON.stringify({ emoji })), { reliable: false });
    },
    [send, addReaction],
  );

  return { reactions, sendReaction };
}
import { useFormStatus } from "react-dom";
import type { MeetingVideoRecordingProps } from "./VideoPopoutShell";
import type { MeetingVideoPermissionsProps } from "./VideoPopoutShell";
import {
  lowerOwnHand,
  markCurrentUserVideoJoined,
  markCurrentUserVideoLeft,
  raiseHand,
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
  permissions: MeetingVideoPermissionsProps;
};

type TokenResponse = {
  permissions: MeetingVideoPermissionsProps;
  roomName: string;
  serverUrl: string;
  token: string;
};

export function MeetingVideoRoom({
  workspaceId,
  meetingId,
  disabled = false,
  mode = "full",
  permissions,
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
        permissions={permissions}
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
  permissions,
  workspaceId,
}: {
  hasJoinedVideo: boolean;
  meetingId: string;
  mode: "full" | "floating";
  recording?: MeetingVideoRecordingProps;
  recordingReturnTo: "current" | "hub" | "video";
  permissions: MeetingVideoPermissionsProps;
  workspaceId: string;
}) {
  const [showLocalPreview, setShowLocalPreview] = useState(false);
  const { reactions, sendReaction } = useEmojiReactions();
  const livekitPermissions = useLocalParticipantPermissions();
  const localParticipant = useLocalParticipant();
  const effectivePermissions = useMemo(
    () => mergeLiveKitPermissions(permissions, livekitPermissions),
    [livekitPermissions, permissions],
  );
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const speakingParticipants = useSpeakingParticipants();
  const displayTracks = useMemo(
    () => getDisplayTracks(tracks, speakingParticipants, mode, showLocalPreview),
    [mode, showLocalPreview, speakingParticipants, tracks],
  );
  const gridClassName = getVideoGridClassName(displayTracks.length, mode);

  useEffect(() => {
    if (!effectivePermissions.canUseMic && localParticipant.isMicrophoneEnabled) {
      void localParticipant.localParticipant.setMicrophoneEnabled(false);
    }

    if (!effectivePermissions.canUseCamera && localParticipant.isCameraEnabled) {
      void localParticipant.localParticipant.setCameraEnabled(false);
    }

    if (!effectivePermissions.canShareScreen && localParticipant.isScreenShareEnabled) {
      void localParticipant.localParticipant.setScreenShareEnabled(false);
    }
  }, [
    effectivePermissions.canShareScreen,
    effectivePermissions.canUseCamera,
    effectivePermissions.canUseMic,
    localParticipant.isCameraEnabled,
    localParticipant.isMicrophoneEnabled,
    localParticipant.isScreenShareEnabled,
    localParticipant.localParticipant,
  ]);

  return (
    <div className={mode === "floating" ? "relative flex h-full min-h-0 flex-col bg-[#11110f]" : "relative flex min-h-[calc(100vh-220px)] flex-col bg-[#11110f]"}>
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
      <EmojiOverlay reactions={reactions} />
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
        <StartMediaButton
          className={getControlClassName(mode, effectivePermissions.canUseMic || effectivePermissions.canUseCamera)}
          disabled={!effectivePermissions.canUseMic && !effectivePermissions.canUseCamera}
        >
          Start Media
        </StartMediaButton>
        <PermissionTrackToggle
          enabled={effectivePermissions.canUseMic}
          mode={mode}
          source={Track.Source.Microphone}
        >
          Mic
        </PermissionTrackToggle>
        <PermissionTrackToggle
          enabled={effectivePermissions.canUseCamera}
          mode={mode}
          source={Track.Source.Camera}
        >
          Camera
        </PermissionTrackToggle>
        <PermissionTrackToggle
          enabled={effectivePermissions.canShareScreen}
          mode={mode}
          source={Track.Source.ScreenShare}
        >
          Share
        </PermissionTrackToggle>
        {(permissions.canRaiseHand || permissions.handRaised) ? (
          <HandRaiseButton
            workspaceId={workspaceId}
            meetingId={meetingId}
            handRaised={permissions.handRaised}
            mode={mode}
          />
        ) : null}
        {mode === "floating" ? (
          <button
            type="button"
            onClick={() => setShowLocalPreview((value) => !value)}
            className={getControlClassName(mode)}
          >
            {showLocalPreview ? "Hide Self" : "Self"}
          </button>
        ) : null}
        <EmojiPickerButton sendReaction={sendReaction} mode={mode} />
        <DisconnectButton className={getLeaveClassName(mode)}>
          Leave
        </DisconnectButton>
      </div>
    </div>
  );
}

function HandRaiseButton({
  handRaised,
  meetingId,
  mode,
  workspaceId,
}: {
  handRaised: boolean;
  meetingId: string;
  mode: "full" | "floating";
  workspaceId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("meetingId", meetingId);
      await (handRaised ? lowerOwnHand(fd) : raiseHand(fd));
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={getControlClassName(mode, true) + (handRaised ? " !bg-white/25" : "")}
    >
      {handRaised ? "✋ Lower" : "✋ Raise"}
    </button>
  );
}

function PermissionTrackToggle({
  children,
  enabled,
  mode,
  source,
}: {
  children: ReactNode;
  enabled: boolean;
  mode: "full" | "floating";
  source: Track.Source.Microphone | Track.Source.Camera | Track.Source.ScreenShare;
}) {
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className={getControlClassName(mode, false)}
      >
        {children}
      </button>
    );
  }

  return (
    <TrackToggle source={source} className={getControlClassName(mode)}>
      {children}
    </TrackToggle>
  );
}

function mergeLiveKitPermissions(
  permissions: MeetingVideoPermissionsProps,
  livekitPermissions: { canPublish?: boolean; canPublishSources?: unknown[] } | undefined,
): MeetingVideoPermissionsProps {
  if (!livekitPermissions) {
    return permissions;
  }

  const canPublish = livekitPermissions.canPublish !== false;
  const sources = livekitPermissions.canPublishSources ?? [];

  return {
    ...permissions,
    canUseMic: permissions.canUseMic && canPublish && isLiveKitSourceAllowed(sources, 2),
    canUseCamera: permissions.canUseCamera && canPublish && isLiveKitSourceAllowed(sources, 1),
    canShareScreen:
      permissions.canShareScreen &&
      canPublish &&
      isLiveKitSourceAllowed(sources, 3) &&
      isLiveKitSourceAllowed(sources, 4),
  };
}

function isLiveKitSourceAllowed(sources: unknown[], source: number) {
  return sources.length === 0 || sources.includes(source);
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

// ── Emoji overlay ─────────────────────────────────────────────────────────────

function EmojiOverlay({ reactions }: { reactions: EmojiReaction[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-16 select-none text-center"
          style={{ left: `${r.x}%`, animation: `emoji-float ${REACTION_DURATION_MS}ms ease-out forwards` }}
        >
          <div className="text-3xl leading-none">{r.emoji}</div>
          <div className="mt-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white/90 whitespace-nowrap">
            {r.sender}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Emoji picker button ────────────────────────────────────────────────────────

function EmojiPickerButton({
  mode,
  sendReaction,
}: {
  mode: "full" | "floating";
  sendReaction: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={getControlClassName(mode, true) + (open ? " !bg-white/25" : "")}
        aria-label="Emoji reactions"
      >
        {mode === "floating" ? "😊" : "React 😊"}
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 flex gap-1 rounded-xl border border-white/15 bg-[#1e1e1b] p-2 shadow-2xl">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                sendReaction(emoji);
                setOpen(false);
              }}
              className="rounded-lg p-1.5 text-2xl transition hover:bg-white/15 active:scale-90"
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

function getControlClassName(mode: "full" | "floating", enabled = true) {
  const disabledClassName = enabled ? "" : " cursor-not-allowed opacity-45";

  if (mode === "floating") {
    return `rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20${disabledClassName}`;
  }

  return `rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20${disabledClassName}`;
}

function getLeaveClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "rounded-md border border-[#f1c7c2] bg-[#fff7f5] px-3 py-1.5 text-xs font-medium text-[#7a3434] transition hover:bg-white";
  }

  return "rounded-md border border-[#f1c7c2] bg-[#fff7f5] px-4 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-white";
}
