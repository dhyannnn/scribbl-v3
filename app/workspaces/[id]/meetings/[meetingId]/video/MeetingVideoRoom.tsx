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
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  markCurrentUserVideoJoined,
  markCurrentUserVideoLeft,
} from "../actions";

type MeetingVideoRoomProps = {
  workspaceId: string;
  meetingId: string;
  disabled?: boolean;
  mode?: "full" | "floating";
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
}: MeetingVideoRoomProps) {
  const [connection, setConnection] = useState<TokenResponse | null>(null);
  const [error, setError] = useState("");
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

    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
    }

    leaveTimeoutRef.current = window.setTimeout(() => {
      leaveTimeoutRef.current = null;
      void markCurrentUserVideoLeft(workspaceId, meetingId, clientSessionId);
    }, 1200);
  }, [meetingId, workspaceId]);

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
          void markCurrentUserVideoJoined(workspaceId, meetingId, clientSessionIdRef.current);
        });
      }}
      onDisconnected={markLeft}
      data-lk-theme="default"
      className={getRoomClassName(mode)}
    >
      <ConferenceSurface mode={mode} />
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

function ConferenceSurface({ mode }: { mode: "full" | "floating" }) {
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
