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
import {
  ChevronDown, ChevronRight,
  LayoutGrid, Crosshair,
  Maximize2, Minimize2,
  Circle, Square,
} from "lucide-react";

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
  autoJoin?: boolean;
  canRecord?: boolean;
  disabled?: boolean;
  mode?: "full" | "floating";
  recording?: MeetingVideoRecordingProps;
  recordingReturnTo?: "current" | "hub" | "video";
  permissions: MeetingVideoPermissionsProps;
  onAfterLeave?: () => void;
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
  autoJoin = false,
  canRecord = true,
  disabled = false,
  mode = "full",
  permissions,
  recording,
  recordingReturnTo = "video",
  onAfterLeave,
}: MeetingVideoRoomProps) {
  const [connection, setConnection] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
  const [hasMarkedJoined, setHasMarkedJoined] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showConflictModal, setShowConflictModal] = useState(false);
  // Persist clientSessionId across same-browser mode switches (floating → full → split).
  // A different device has no stored ID so it always generates a fresh one, which is
  // what triggers the real cross-device conflict check.
  const clientSessionIdRef = useRef(getStoredClientSessionId(meetingId));
  const connectedRef = useRef(false);
  const leaveTimeoutRef = useRef<number | null>(null);
  const activeSessionIntervalRef = useRef<number | null>(null);

  const markLeft = useCallback(() => {
    const clientSessionId = clientSessionIdRef.current;

    if (!connectedRef.current || !clientSessionId) {
      return;
    }

    connectedRef.current = false;
    setHasMarkedJoined(false);

    if (activeSessionIntervalRef.current !== null) {
      window.clearInterval(activeSessionIntervalRef.current);
      activeSessionIntervalRef.current = null;
    }

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
    setConnection(null);
    onAfterLeave?.();
  }, [markLeft, onAfterLeave]);

  useEffect(() => {
    return () => {
      markLeft();
    };
  }, [markLeft]);

  const fetchToken = useCallback(async (force = false) => {
    const clientSessionId = clientSessionIdRef.current || createClientSessionId();
    clientSessionIdRef.current = clientSessionId;

    const response = await fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, meetingId, clientSessionId, ...(force ? { force: true } : {}) }),
    });
    const payload = await response.json();

    if (response.status === 409 && payload.conflict) {
      setShowConflictModal(true);
      return;
    }

    if (!response.ok) {
      clientSessionIdRef.current = "";
      clearStoredClientSessionId(meetingId);
      setError(typeof payload?.error === "string" ? payload.error : "Unable to join video.");
      return;
    }

    storeClientSessionId(meetingId, clientSessionId);
    setConnection(payload as TokenResponse);
  }, [meetingId, workspaceId]);

  const joinRoom = useCallback(async () => {
    setError("");
    // Don't overwrite — fetchToken reuses existing session ID or creates one if empty
    try {
      await fetchToken(false);
    } catch {
      clientSessionIdRef.current = "";
      setError("Unable to reach the video service.");
    }
  }, [fetchToken]);

  const joinForced = useCallback(async () => {
    setShowConflictModal(false);
    setError("");
    try {
      await fetchToken(true);
    } catch {
      clientSessionIdRef.current = "";
      setError("Unable to reach the video service.");
    }
  }, [fetchToken]);

  useEffect(() => {
    if (!autoJoin || disabled || connection || isPending) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void joinRoom();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [autoJoin, connection, disabled, isPending, joinRoom]);

  if (!connection) {
    return (
      <>
        {/* Multi-device conflict modal */}
        {showConflictModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
              <div className="mb-1 flex items-center gap-2 text-[var(--color-warning)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <h2 className="font-semibold text-[var(--color-text)]">Already in this meeting</h2>
              </div>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                You&apos;re in this meeting from another device. Joining here will disconnect that session.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConflictModal(false)}
                  className="flex-1 rounded-full border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={joinForced}
                  className="flex-1 rounded-full bg-[var(--color-secondary)] py-2 text-sm font-medium text-white transition hover:bg-[var(--color-secondary-hover)]"
                >
                  Join here
                </button>
              </div>
            </div>
          </div>
        )}

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
      </>
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
        markActiveVideoSession(meetingId);
        if (activeSessionIntervalRef.current !== null) {
          window.clearInterval(activeSessionIntervalRef.current);
        }
        activeSessionIntervalRef.current = window.setInterval(() => {
          markActiveVideoSession(meetingId);
        }, 10_000);
        startTransition(() => {
          void markCurrentUserVideoJoined(workspaceId, meetingId, clientSessionIdRef.current).then(() => {
            setHasMarkedJoined(true);
          });
        });
      }}
      onDisconnected={leaveRoom}
      data-lk-theme="default"
      className={`${getRoomClassName(mode)} ${mode === "full" ? "scribbl-full-video-room" : ""}`}
      style={mode === "full" ? { height: "100%" } : undefined}
    >
      <ConferenceSurface
        workspaceId={workspaceId}
        meetingId={meetingId}
        mode={mode}
        recording={recording}
        canRecord={canRecord}
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

function markActiveVideoSession(meetingId: string) {
  window.localStorage.setItem(getActiveVideoStorageKey(meetingId), String(Date.now()));
}

export function hasRecentActiveVideoSession(meetingId: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const value = window.localStorage.getItem(getActiveVideoStorageKey(meetingId));
  const timestamp = value ? Number(value) : 0;
  return Number.isFinite(timestamp) && Date.now() - timestamp < 30_000;
}

function getActiveVideoStorageKey(meetingId: string) {
  return `scribbl-video-active:${meetingId}`;
}

// Persist clientSessionId so same-browser mode switches (floating → full → split)
// reuse the same DB session and never trip the cross-device conflict check.
function storeClientSessionId(meetingId: string, id: string) {
  try { localStorage.setItem(`scribbl-video-sid:${meetingId}`, id); } catch { /* ignore */ }
}

function getStoredClientSessionId(meetingId: string): string {
  try { return localStorage.getItem(`scribbl-video-sid:${meetingId}`) ?? ""; } catch { return ""; }
}

function clearStoredClientSessionId(meetingId: string) {
  try { localStorage.removeItem(`scribbl-video-sid:${meetingId}`); } catch { /* ignore */ }
}

function ConferenceSurface({
  hasJoinedVideo,
  meetingId,
  mode,
  recording,
  canRecord,
  recordingReturnTo,
  permissions,
  workspaceId,
}: {
  hasJoinedVideo: boolean;
  meetingId: string;
  mode: "full" | "floating";
  recording?: MeetingVideoRecordingProps;
  canRecord: boolean;
  recordingReturnTo: "current" | "hub" | "video";
  permissions: MeetingVideoPermissionsProps;
  workspaceId: string;
}) {
  const [showLocalPreview, setShowLocalPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"gallery" | "spotlight">("gallery");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (isFullscreen) {
      void document.exitFullscreen();
    } else if (containerRef.current) {
      void containerRef.current.requestFullscreen();
    }
  }
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
    () => getDisplayTracks(tracks, speakingParticipants, mode, showLocalPreview, viewMode),
    [mode, showLocalPreview, speakingParticipants, tracks, viewMode],
  );
  const gridClassName = getVideoGridClassName(displayTracks.length, mode, viewMode);

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

  const tileClassName = mode === "floating"
    ? "h-full min-h-[150px] overflow-hidden rounded-xl bg-[#0f1929]"
    : "h-full min-h-[200px] overflow-hidden rounded-xl bg-[#0f1929]";

  const emptyClassName = mode === "floating"
    ? "col-span-full flex min-h-[150px] items-center justify-center rounded-xl border border-white/10 bg-[#0f1929] p-4 text-center"
    : "col-span-full flex min-h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#0f1929] p-6 text-center";

  return (
    <div
      ref={containerRef}
      className={mode === "floating"
        ? "relative flex h-full min-h-0 flex-col bg-[var(--color-live)]"
        : "relative flex h-full min-h-0 flex-col bg-[var(--color-live)]"
      }
    >
      {/* Video grid */}
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
              className={tileClassName}
            />
          ))
        ) : (
          <div className={emptyClassName}>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/50">
                {mode === "floating" ? "Waiting for speaker" : "Connected"}
              </p>
              <p className="mt-3 text-sm leading-6 text-white/40">
                {mode === "floating"
                  ? "Remote video will appear here when someone joins."
                  : "Turn on your camera or wait for someone else to join."}
              </p>
              {mode === "floating" && tracks.some((trackRef) => trackRef.participant.isLocal) ? (
                <button
                  type="button"
                  onClick={() => setShowLocalPreview(true)}
                  className="mt-4 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
                >
                  Show Preview
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <EmojiOverlay reactions={reactions} />

      {/* Floating controls bar */}
      {mode === "floating" ? (
        <div className="flex flex-wrap items-center justify-center gap-1 border-t border-white/10 bg-black/40 p-1.5 backdrop-blur-sm">
          <StartMediaButton className={getControlClassName(mode, effectivePermissions.canUseMic || effectivePermissions.canUseCamera)} disabled={!effectivePermissions.canUseMic && !effectivePermissions.canUseCamera}>
            Start
          </StartMediaButton>
          <PermissionTrackToggle enabled={effectivePermissions.canUseMic} mode={mode} source={Track.Source.Microphone}>Mic</PermissionTrackToggle>
          <PermissionTrackToggle enabled={effectivePermissions.canUseCamera} mode={mode} source={Track.Source.Camera}>Cam</PermissionTrackToggle>
          {(permissions.canRaiseHand || permissions.handRaised) ? (
            <HandRaiseButton workspaceId={workspaceId} meetingId={meetingId} handRaised={permissions.handRaised} mode={mode} />
          ) : null}
          <button type="button" onClick={() => setShowLocalPreview((v) => !v)} className={getControlClassName(mode)}>
            {showLocalPreview ? "Hide" : "Self"}
          </button>
          <EmojiPickerButton sendReaction={sendReaction} mode={mode} />
          <DisconnectButton className={getLeaveClassName(mode)}>Leave</DisconnectButton>
        </div>
      ) : (
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1.5 shadow-2xl backdrop-blur-md">
          {/* Collapse / expand toggle — always visible */}
          <button
            type="button"
            onClick={() => setShowControls((v) => !v)}
            className={getControlClassName(mode)}
            title={showControls ? "Hide controls" : "Show controls"}
          >
            {showControls
              ? <ChevronDown size={13} />
              : <ChevronRight size={13} />
            }
          </button>

          {/* All main controls — hidden when collapsed */}
          {showControls && (
            <>
              <div className="mx-0.5 h-4 w-px bg-white/20" />
              <button
                type="button"
                onClick={() => setViewMode((v) => v === "gallery" ? "spotlight" : "gallery")}
                className={getControlClassName(mode)}
                title={viewMode === "gallery" ? "Spotlight view" : "Gallery view"}
              >
                {viewMode === "gallery" ? <LayoutGrid size={13} /> : <Crosshair size={13} />}
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className={getControlClassName(mode)}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <div className="mx-0.5 h-4 w-px bg-white/20" />
              {recording ? (
                <RecordingControls
                  workspaceId={workspaceId}
                  meetingId={meetingId}
                  recording={recording}
                  canRecord={canRecord}
                  hasJoinedVideo={hasJoinedVideo}
                  mode={mode}
                  recordingReturnTo={recordingReturnTo}
                />
              ) : null}
              <StartMediaButton
                className={getControlClassName(mode, effectivePermissions.canUseMic || effectivePermissions.canUseCamera)}
                disabled={!effectivePermissions.canUseMic && !effectivePermissions.canUseCamera}
              >
                Start
              </StartMediaButton>
              <PermissionTrackToggle enabled={effectivePermissions.canUseMic} mode={mode} source={Track.Source.Microphone}>Mic</PermissionTrackToggle>
              <PermissionTrackToggle enabled={effectivePermissions.canUseCamera} mode={mode} source={Track.Source.Camera}>Cam</PermissionTrackToggle>
              <PermissionTrackToggle enabled={effectivePermissions.canShareScreen} mode={mode} source={Track.Source.ScreenShare}>Share</PermissionTrackToggle>
              {(permissions.canRaiseHand || permissions.handRaised) ? (
                <HandRaiseButton workspaceId={workspaceId} meetingId={meetingId} handRaised={permissions.handRaised} mode={mode} />
              ) : null}
              <EmojiPickerButton sendReaction={sendReaction} mode={mode} />
              <div className="mx-0.5 h-4 w-px bg-white/20" />
            </>
          )}

          {/* Leave — always visible */}
          <DisconnectButton className={getLeaveClassName(mode)}>Leave</DisconnectButton>
        </div>
      )}
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
  canRecord,
  recordingReturnTo,
  workspaceId,
  mode,
}: {
  hasJoinedVideo: boolean;
  meetingId: string;
  mode: "full" | "floating";
  recording: MeetingVideoRecordingProps;
  canRecord: boolean;
  recordingReturnTo: "current" | "hub" | "video";
  workspaceId: string;
}) {
  const router = useRouter();
  const activeRecording = recording.activeRecording;
  const latestRecording = recording.latestRecording;
  const isRecordingMutable =
    activeRecording && ["STARTING", "ACTIVE", "STOPPING"].includes(activeRecording.status);
  const canStartRecording = canRecord && recording.canManage && hasJoinedVideo && !activeRecording;
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

  // Compact inline recording controls — no card/panel, just buttons in the pill
  return (
    <>
      {/* Active recording pulse indicator */}
      {activeRecording && (
        <span
          className={`${getControlClassName(mode)} flex items-center gap-1`}
          title={activeRecording.status === "ACTIVE" ? "Recording live" : activeRecording.status === "STOPPING" ? "Finalizing…" : "Recording starting"}
        >
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-danger)]" />
          REC
        </span>
      )}

      {/* Upgrade prompt — non-manager on free plan */}
      {recording.canManage && !activeRecording && !canRecord ? (
        <a href={`/workspaces/${workspaceId}/billing`} className={getControlClassName(mode)}>
          Upgrade
        </a>
      ) : null}

      {/* Start recording */}
      {recording.canManage && !activeRecording && canRecord ? (
        <form action={submitStartRecording} className="inline-flex">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="recordingReturnTo" value={recordingReturnTo} />
          <RecordingSubmitButton disabled={!canStartRecording} mode={mode} variant="start">
            <span className="flex items-center gap-1"><Circle size={8} className="fill-current" /> Rec</span>
          </RecordingSubmitButton>
        </form>
      ) : null}

      {/* Stop recording */}
      {recording.canManage && activeRecording ? (
        <form action={submitStopRecording} className="inline-flex">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="recordingId" value={activeRecording.id} />
          <input type="hidden" name="recordingReturnTo" value={recordingReturnTo} />
          <RecordingSubmitButton disabled={activeRecording.status === "STOPPING"} mode={mode} variant="stop">
            <span className="flex items-center gap-1"><Square size={8} className="fill-current" /> Stop</span>
          </RecordingSubmitButton>
        </form>
      ) : null}

      {/* Link to completed recording */}
      {latestRecording?.file ? (
        <Link href={`/api/files/${latestRecording.file.id}`} target="_blank" className={getRecordingLinkClassName(mode)}>
          View Rec
        </Link>
      ) : null}
    </>
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

function getRecordingButtonClassName(_mode: "full" | "floating", variant: "start" | "stop") {
  const sizeClassName = "px-2.5 py-1 text-xs";

  if (variant === "stop") {
    return `${sizeClassName} rounded-full bg-[var(--color-danger)] font-semibold text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50`;
  }

  return `${sizeClassName} rounded-full border border-white/15 bg-white/10 font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50`;
}

function getRecordingLinkClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "inline-flex min-h-7 items-center rounded-full border border-white/15 bg-white/10 px-2.5 text-xs font-medium text-white transition hover:bg-white/20";
  }
  return "inline-flex min-h-8 items-center rounded-full border border-white/15 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/20";
}

function getDisplayTracks(
  tracks: TrackReference[],
  speakingParticipants: { identity: string; isLocal?: boolean }[],
  mode: "full" | "floating",
  showLocalPreview: boolean,
  viewMode: "gallery" | "spotlight" = "gallery",
) {
  if (mode === "full" && viewMode === "spotlight") {
    const screenShare = tracks.find((t) => t.source === Track.Source.ScreenShare);
    const activeIdentities = speakingParticipants.filter((p) => !p.isLocal).map((p) => p.identity);
    const activeCamera = tracks.find(
      (t) => t.source === Track.Source.Camera && activeIdentities.includes(t.participant.identity),
    );
    const spotlight = screenShare ?? activeCamera ?? tracks.find((t) => !t.participant.isLocal) ?? tracks[0];
    return spotlight ? [spotlight] : [];
  }

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
        <div className="absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 flex gap-1 rounded-xl border border-white/15 bg-[#0c1525] p-2 shadow-2xl">
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
    return "flex h-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0f1929] p-4 text-center text-white";
  }
  return "flex h-full min-h-[400px] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0f1929] p-6 text-center text-white";
}

function getRoomClassName(mode: "full" | "floating") {
  if (mode === "floating") {
    return "h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[var(--color-live)]";
  }
  return "h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-[var(--color-live)]";
}

function getVideoGridClassName(trackCount: number, mode: "full" | "floating", viewMode: "gallery" | "spotlight" = "gallery") {
  if (mode === "floating") {
    const base = "grid min-h-0 flex-1 gap-2 overflow-auto p-2";
    return trackCount <= 1 ? `${base} grid-cols-1` : `${base} grid-cols-1`;
  }

  // Full mode — tiles fill available height via auto-rows-fr
  const base = "grid min-h-0 flex-1 gap-3 p-3 pb-20 auto-rows-fr";

  if (trackCount <= 1 || viewMode === "spotlight") return `${base} grid-cols-1`;
  if (trackCount === 2) return `${base} grid-cols-2`;
  if (trackCount <= 4) return `${base} grid-cols-2 grid-rows-2`;
  return `${base} grid-cols-3`;
}

function getControlClassName(mode: "full" | "floating", enabled = true) {
  const disabled = enabled ? "" : " cursor-not-allowed opacity-40";
  if (mode === "floating") {
    return `rounded-full border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20${disabled}`;
  }
  // Full mode — compact pill buttons
  return `rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-white/20${disabled}`;
}

function getLeaveClassName(mode: "full" | "floating") {
  return `rounded-full bg-[var(--color-danger)] ${mode === "floating" ? "px-2 py-1 text-xs" : "px-2.5 py-1 text-xs"} font-semibold text-white transition hover:opacity-80`;
}
