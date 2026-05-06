"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MeetingVideoRoom } from "./MeetingVideoRoom";

type FloatingMeetingVideoProps = {
  workspaceId: string;
  meetingId: string;
  videoHref: string;
  disabled?: boolean;
};

type PanelState = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PanelBounds = {
  width: number;
  height: number;
};

type StoredPanelState = {
  panel: PanelState;
  minimized: boolean;
};

type InteractionState = {
  pointerId: number;
  startX: number;
  startY: number;
  startPanel: PanelState;
  type: "drag" | "resize";
};

type VideoSurfaceState = "hub" | "split" | "popout" | "popout-closed";

type VideoChannelMessage =
  | { type: "popout-opened" }
  | { type: "popout-ready" }
  | { type: "popout-closed" }
  | { type: "bring-back" }
  | { type: "focus-hub"; hash: string };

const minPanelWidth = 320;
const minPanelHeight = 260;
const snapDistance = 48;
const splitWidth = "clamp(420px, 49vw, 780px)";

export function FloatingMeetingVideo({
  workspaceId,
  meetingId,
  disabled = false,
}: FloatingMeetingVideoProps) {
  const [panel, setPanel] = useState(getServerSafeDefaultPanel);
  const [isMinimized, setIsMinimized] = useState(false);
  const [videoSurface, setVideoSurface] = useState<VideoSurfaceState>("hub");
  const [hasHydrated, setHasHydrated] = useState(false);
  const hasLoadedStoredPanelRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const popoutRef = useRef<Window | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const frameRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const pendingPanelRef = useRef<PanelState | null>(null);

  useEffect(() => {
    if (!hasLoadedStoredPanelRef.current) {
      return;
    }

    window.localStorage.setItem(
      getStorageKey(meetingId),
      JSON.stringify({ panel, minimized: isMinimized } satisfies StoredPanelState),
    );
  }, [isMinimized, meetingId, panel]);

  useEffect(() => {
    const storedPanel = loadStoredPanel(meetingId);
    const restoreFrame = window.requestAnimationFrame(() => {
      hasLoadedStoredPanelRef.current = true;
      setPanel(storedPanel.panel);
      setIsMinimized(storedPanel.minimized);
      setHasHydrated(true);
    });

    return () => window.cancelAnimationFrame(restoreFrame);
  }, [meetingId]);

  useEffect(() => {
    const channel = new BroadcastChannel(getChannelName(meetingId));
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<VideoChannelMessage>) => {
      if (event.data.type === "popout-opened" || event.data.type === "popout-ready") {
        setVideoSurface("popout");
      }

      if (event.data.type === "popout-closed") {
        setVideoSurface("popout-closed");
      }

      if (event.data.type === "bring-back") {
        setVideoSurface("hub");
        setIsMinimized(false);
      }

      if (event.data.type === "focus-hub") {
        window.focus();
        scrollToHubSection(event.data.hash);
      }
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [meetingId]);

  useEffect(() => {
    if (videoSurface !== "popout") {
      return;
    }

    const interval = window.setInterval(() => {
      if (popoutRef.current?.closed) {
        popoutRef.current = null;
        setVideoSurface("popout-closed");
        channelRef.current?.postMessage({ type: "popout-closed" } satisfies VideoChannelMessage);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [videoSurface]);

  useEffect(() => {
    if (videoSurface !== "split") {
      return;
    }

    const previousSplitWidth = document.body.style.getPropertyValue("--scribbl-video-split-width");

    document.body.style.setProperty("--scribbl-video-split-width", splitWidth);
    document.body.classList.add("scribbl-video-split-active");

    return () => {
      if (previousSplitWidth) {
        document.body.style.setProperty("--scribbl-video-split-width", previousSplitWidth);
      } else {
        document.body.style.removeProperty("--scribbl-video-split-width");
      }

      document.body.classList.remove("scribbl-video-split-active");
    };
  }, [videoSurface]);

  const commitPanel = useCallback((nextPanel: PanelState) => {
    pendingPanelRef.current = clampPanel(nextPanel, getRenderedPanelBounds(panelRef.current));

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;

      if (pendingPanelRef.current) {
        setPanel(pendingPanelRef.current);
        pendingPanelRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;

      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      if (interaction.type === "drag") {
        commitPanel({
          ...interaction.startPanel,
          left: interaction.startPanel.left + event.clientX - interaction.startX,
          top: interaction.startPanel.top + event.clientY - interaction.startY,
        });
      } else {
        commitPanel({
          ...interaction.startPanel,
          width: interaction.startPanel.width + event.clientX - interaction.startX,
          height: interaction.startPanel.height + event.clientY - interaction.startY,
        });
      }
    }

    function handlePointerUp(event: PointerEvent) {
      const interaction = interactionRef.current;

      if (!interaction || event.pointerId !== interaction.pointerId) {
        return;
      }

      interactionRef.current = null;
      setPanel((currentPanel) => {
        const bounds = getRenderedPanelBounds(panelRef.current);

        return snapPanel(clampPanel(currentPanel, bounds), bounds);
      });
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [commitPanel]);

  function startInteraction(event: ReactPointerEvent<HTMLElement>, type: InteractionState["type"]) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanel: panel,
      type,
    };
  }

  function openSplitView() {
    setVideoSurface("split");
    setIsMinimized(false);
  }

  function focusPopout() {
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus();
    }
  }

  function bringBackVideo() {
    channelRef.current?.postMessage({ type: "bring-back" } satisfies VideoChannelMessage);
    setVideoSurface("hub");
    setIsMinimized(false);
  }

  function showPanel() {
    setPanel((currentPanel) => clampPanel(currentPanel));
    setIsMinimized(false);
  }

  function toggleMinimized() {
    if (isMinimized) {
      showPanel();
      return;
    }

    setIsMinimized(true);
  }

  function focusHubSection(hash: string) {
    window.focus();
    scrollToHubSection(hash);
  }

  if (!hasHydrated) {
    return null;
  }

  if (videoSurface === "split") {
    return (
      <aside
        className="scribbl-video-split-panel z-50 flex flex-col border border-[#d8d8ce] bg-[#171713] text-white shadow-2xl min-[1101px]:border-y-0 min-[1101px]:border-r-0"
        style={{ "--scribbl-split-panel-width": splitWidth } as CSSProperties}
      >
        <header className="border-b border-white/10 px-6 py-5">
          <button
            type="button"
            onClick={bringBackVideo}
            className="text-sm font-medium text-[#b7c8ba] transition hover:text-white"
          >
            Bring video back
          </button>
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-[#b7c8ba]">
            Split video
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal">Meeting video</h2>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={() => focusHubSection("#meeting-notes")}
              className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
            >
              Open Notes
            </button>
            <button
              type="button"
              onClick={() => focusHubSection("#meeting-chat")}
              className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
            >
              Open Chat
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden p-5">
          <MeetingVideoRoom workspaceId={workspaceId} meetingId={meetingId} disabled={disabled} mode="floating" />
        </div>
      </aside>
    );
  }

  if (videoSurface === "popout" || videoSurface === "popout-closed") {
    return (
      <aside
        className="fixed z-50 rounded-md border border-[#2f604b]/40 bg-[#171713] text-white shadow-2xl"
        style={{
          left: panel.left,
          top: panel.top,
          width: 300,
          touchAction: "none",
        }}
      >
        <div
          className="flex cursor-move items-center justify-between gap-3 rounded-md bg-[#20201d] px-3 py-2"
          onPointerDown={(event) => startInteraction(event, "drag")}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {videoSurface === "popout" ? "Video is open in popout" : "Video popout closed"}
            </p>
            <p className="truncate text-xs text-white/60">
              {videoSurface === "popout" ? "The hub stays active here." : "Reconnect video in this panel."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {videoSurface === "popout" ? (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={focusPopout}
                className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20"
              >
                Focus
              </button>
            ) : null}
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={bringBackVideo}
              className="rounded-md bg-white px-2 py-1 text-xs font-medium text-[#20201d] transition hover:bg-[#eef5ef]"
            >
              {videoSurface === "popout" ? "Bring Back" : "Reconnect"}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      className="fixed z-50 overflow-hidden rounded-md border border-[#2f604b]/40 bg-[#171713] text-white shadow-2xl"
      style={{
        left: panel.left,
        top: panel.top,
        width: isMinimized ? 260 : panel.width,
        height: isMinimized ? "auto" : panel.height,
        touchAction: "none",
      }}
    >
      <div
        className="flex cursor-move items-center justify-between gap-3 border-b border-white/10 bg-[#20201d] px-3 py-2"
        onPointerDown={(event) => startInteraction(event, "drag")}
      >
        <p className="truncate text-sm font-medium">Video</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={openSplitView}
            className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20"
          >
            Split View
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={toggleMinimized}
            className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium text-white transition hover:bg-white/20"
          >
            {isMinimized ? "Show" : "Hide"}
          </button>
        </div>
      </div>

      {!isMinimized ? (
        <div className="overflow-hidden" style={{ width: "100%", height: `calc(100% - 41px)` }}>
          <MeetingVideoRoom workspaceId={workspaceId} meetingId={meetingId} disabled={disabled} mode="floating" />
        </div>
      ) : (
        <button
          type="button"
          onClick={showPanel}
          className="block w-full px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/10"
        >
          Video hidden
        </button>
      )}
      {!isMinimized ? (
        <button
          type="button"
          aria-label="Resize video"
          className="absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-white/40"
          onPointerDown={(event) => startInteraction(event, "resize")}
        />
      ) : null}
    </aside>
  );
}

function getStorageKey(meetingId: string) {
  return `scribbl-floating-video:v2:${meetingId}`;
}

function getChannelName(meetingId: string) {
  return `scribbl-video-${meetingId}`;
}

function scrollToHubSection(hash: string) {
  const targetId = hash.startsWith("#") ? hash.slice(1) : hash;
  const target = document.getElementById(targetId);

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${targetId}`);
  }
}

function getServerSafeDefaultPanel(): PanelState {
  return {
    left: 24,
    top: 24,
    width: 420,
    height: 340,
  };
}

function getDefaultPanel(): PanelState {
  const width = Math.min(420, Math.max(minPanelWidth, window.innerWidth - 32));
  const height = Math.min(340, Math.max(minPanelHeight, window.innerHeight - 32));

  return {
    left: Math.max(12, window.innerWidth - width - 24),
    top: Math.max(12, window.innerHeight - height - 24),
    width,
    height,
  };
}

function loadStoredPanel(meetingId: string): StoredPanelState {
  const fallback = {
    panel: getDefaultPanel(),
    minimized: false,
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  const savedPanel = window.localStorage.getItem(getStorageKey(meetingId));

  if (!savedPanel) {
    return fallback;
  }

  try {
    const parsedPanel = JSON.parse(savedPanel) as Partial<StoredPanelState>;

    if (
      parsedPanel.panel &&
      typeof parsedPanel.panel.left === "number" &&
      typeof parsedPanel.panel.top === "number" &&
      typeof parsedPanel.panel.width === "number" &&
      typeof parsedPanel.panel.height === "number"
    ) {
      return {
        panel: clampPanel(parsedPanel.panel),
        minimized: parsedPanel.minimized === true,
      };
    }
  } catch {
    window.localStorage.removeItem(getStorageKey(meetingId));
  }

  return fallback;
}

function getRenderedPanelBounds(panelElement: HTMLElement | null): PanelBounds | undefined {
  const rect = panelElement?.getBoundingClientRect();

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }

  return {
    width: rect.width,
    height: rect.height,
  };
}

function clampPanel(panel: PanelState, bounds?: PanelBounds): PanelState {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = bounds?.width ?? Math.min(Math.max(panel.width, minPanelWidth), Math.max(minPanelWidth, viewportWidth - 24));
  const height = bounds?.height ?? Math.min(Math.max(panel.height, minPanelHeight), Math.max(minPanelHeight, viewportHeight - 24));

  return {
    width: bounds ? panel.width : width,
    height: bounds ? panel.height : height,
    left: Math.min(Math.max(panel.left, 12), Math.max(12, viewportWidth - width - 12)),
    top: Math.min(Math.max(panel.top, 12), Math.max(12, viewportHeight - height - 12)),
  };
}

function snapPanel(panel: PanelState, bounds?: PanelBounds): PanelState {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = bounds?.width ?? panel.width;
  const height = bounds?.height ?? panel.height;
  const right = viewportWidth - panel.left - width;
  const bottom = viewportHeight - panel.top - height;
  let nextPanel = panel;

  if (panel.left < snapDistance) {
    nextPanel = { ...nextPanel, left: 12 };
  } else if (right < snapDistance) {
    nextPanel = { ...nextPanel, left: viewportWidth - width - 12 };
  }

  if (panel.top < snapDistance) {
    nextPanel = { ...nextPanel, top: 12 };
  } else if (bottom < snapDistance) {
    nextPanel = { ...nextPanel, top: viewportHeight - height - 12 };
  }

  return clampPanel(nextPanel, bounds);
}
