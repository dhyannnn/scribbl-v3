"use client";

import {
  type ReactNode,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MeetingVideoRoom, hasRecentActiveVideoSession } from "./MeetingVideoRoom";
import type { MeetingVideoPermissionsProps, MeetingVideoRecordingProps } from "./VideoPopoutShell";

type FloatingMeetingVideoProps = {
  workspaceId: string;
  meetingId: string;
  videoHref: string;
  canRecord?: boolean;
  disabled?: boolean;
  recording?: MeetingVideoRecordingProps;
  permissions: MeetingVideoPermissionsProps;
  raisedHandCount?: number;
  pendingRequestCount?: number;
  onAfterLeave?: () => void;
  onDismiss?: () => void;
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
  | { type: "hub-ready" }
  | { type: "popout-opened" }
  | { type: "popout-ready" }
  | { type: "popout-closed" }
  | { type: "bring-back" }
  | { type: "navigate-hub-to"; href: string }
  | { type: "focus-hub"; hash: string }
  | { type: "permissions-updated" };

const minPanelWidth = 280;
const minPanelHeight = 280;
const minimizedPanelWidth = 260;
const snapDistance = 48;
const minSplitVideoWidth = 320;   // minimum video panel width when split
const maxSplitWidthRatio = 0.70;  // video panel can take at most 70% of viewport
// Mirrors the [data-meeting-hub-main] min-width in globals.css — keeps an embedded
// whiteboard (or any hub content) from being squeezed narrower than it can usefully
// render at. The video panel's drag-resize must respect the same floor or the two
// rules fight each other and the panel visually overlaps the hub content.
const minHubWidthInSplit = 640;

function getMaxSplitVideoWidth(viewportWidth: number) {
  return Math.min(
    Math.floor(viewportWidth * maxSplitWidthRatio),
    Math.max(minSplitVideoWidth, viewportWidth - minHubWidthInSplit),
  );
}
const SPLIT_WIDTH_KEY = "scribbl-video-split-width-v1";
const portalPanelStyle = { zIndex: 2147483000, isolation: "isolate" } satisfies CSSProperties;

type SplitResizeState = {
  pointerId: number;
  startX: number;
  startWidth: number;
  maxWidth: number;
};

export function FloatingMeetingVideo({
  workspaceId,
  meetingId,
  videoHref,
  canRecord = true,
  disabled = false,
  recording,
  permissions,
  raisedHandCount = 0,
  pendingRequestCount = 0,
  onAfterLeave,
  onDismiss,
}: FloatingMeetingVideoProps) {
  const router = useRouter();
  const [panel, setPanel] = useState(getServerSafeDefaultPanel);
  const [autoJoin, setAutoJoin] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [videoSurface, setVideoSurface] = useState<VideoSurfaceState>("hub");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [splitVideoWidth, setSplitVideoWidth] = useState(500);
  const hasLoadedStoredPanelRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const popoutRef = useRef<Window | null>(null);
  const isInPopoutRef = useRef(false);
  const interactionRef = useRef<InteractionState | null>(null);
  const splitResizeRef = useRef<SplitResizeState | null>(null);
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
    const storedSplitWidth = loadStoredSplitWidth();
    const restoreFrame = window.requestAnimationFrame(() => {
      hasLoadedStoredPanelRef.current = true;
      setPanel(storedPanel.panel);
      setIsMinimized(storedPanel.minimized);
      setSplitVideoWidth(storedSplitWidth);
      setHasHydrated(true);
    });

    return () => window.cancelAnimationFrame(restoreFrame);
  }, [meetingId]);

  useEffect(() => {
    const channel = new BroadcastChannel(getChannelName(meetingId));
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<VideoChannelMessage>) => {
      if (event.data.type === "popout-opened" || event.data.type === "popout-ready") {
        isInPopoutRef.current = true;
        setVideoSurface("popout");
      }

      if (event.data.type === "popout-closed") {
        // Only auto-rejoin if we're still in popout mode — ignore if bring-back already handled it
        if (isInPopoutRef.current) {
          isInPopoutRef.current = false;
          setAutoJoin(hasRecentActiveVideoSession(meetingId));
          setVideoSurface("hub");
          setIsMinimized(false);
        }
      }

      if (event.data.type === "bring-back") {
        isInPopoutRef.current = false;
        setAutoJoin(hasRecentActiveVideoSession(meetingId));
        setVideoSurface("hub");
        setIsMinimized(false);
      }

      if (event.data.type === "navigate-hub-to") {
        router.push(event.data.href);
      }

      if (event.data.type === "focus-hub") {
        window.focus();
        scrollToHubSection(event.data.hash);
      }

      if (event.data.type === "permissions-updated") {
        router.refresh();
      }
    };

    channel.postMessage({ type: "hub-ready" } satisfies VideoChannelMessage);

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [meetingId, router]);

  // Re-clamp panel (and split width, if active) when window is resized — e.g.
  // entering macOS split view. Without this, a wide split-video-width persisted
  // from a larger window can squeeze the hub content (including an embedded
  // whiteboard) below a usable width on a narrower one.
  useEffect(() => {
    function onResize() {
      setPanel((currentPanel) => clampPanel(currentPanel));
      setSplitVideoWidth((currentWidth) => Math.min(currentWidth, getMaxSplitVideoWidth(window.innerWidth)));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (videoSurface !== "popout") {
      return;
    }

    const interval = window.setInterval(() => {
      if (popoutRef.current?.closed) {
        popoutRef.current = null;
        isInPopoutRef.current = false;
        setAutoJoin(hasRecentActiveVideoSession(meetingId));
        setVideoSurface("hub");
        setIsMinimized(false);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [videoSurface, meetingId]);

  // Activates/deactivates the split class and cleans up on exit
  useEffect(() => {
    if (videoSurface !== "split") return;
    document.body.classList.add("scribbl-video-split-active");
    return () => {
      document.body.classList.remove("scribbl-video-split-active");
      document.body.style.removeProperty("--scribbl-video-split-width");
    };
  }, [videoSurface]);

  // Keeps the CSS variable in sync with the current split width (runs on enter and on every drag)
  useEffect(() => {
    if (videoSurface !== "split") return;
    document.body.style.setProperty("--scribbl-video-split-width", `${splitVideoWidth}px`);
    window.localStorage.setItem(SPLIT_WIDTH_KEY, String(splitVideoWidth));
  }, [videoSurface, splitVideoWidth]);

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
      // Split-panel resize
      const splitResize = splitResizeRef.current;
      if (splitResize && event.pointerId === splitResize.pointerId) {
        const dx = splitResize.startX - event.clientX; // left = wider video
        const next = Math.min(Math.max(splitResize.startWidth + dx, minSplitVideoWidth), splitResize.maxWidth);
        setSplitVideoWidth(next);
        return;
      }

      // Floating-panel drag / resize
      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;

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
      if (splitResizeRef.current?.pointerId === event.pointerId) {
        splitResizeRef.current = null;
        return;
      }

      const interaction = interactionRef.current;
      if (!interaction || event.pointerId !== interaction.pointerId) return;

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

  function openFullVideo() {
    const fullVideo = window.open(videoHref, "_blank");
    if (fullVideo) {
      popoutRef.current = fullVideo;
      isInPopoutRef.current = true;
      setVideoSurface("popout");
      channelRef.current?.postMessage({ type: "popout-opened" } satisfies VideoChannelMessage);
    }
  }

  function focusPopout() {
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus();
    }
  }

  function bringBackVideo() {
    channelRef.current?.postMessage({ type: "bring-back" } satisfies VideoChannelMessage);
    isInPopoutRef.current = false;
    setAutoJoin(hasRecentActiveVideoSession(meetingId));
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

  function renderPortal(content: ReactNode) {
    return createPortal(content, document.body);
  }

  if (videoSurface === "popout" || videoSurface === "popout-closed") {
    return renderPortal(
      <aside
        className="fixed overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        style={{
          left: panel.left,
          top: panel.top,
          width: "min(300px, calc(100vw - 24px))",
          touchAction: "none",
          ...portalPanelStyle,
        }}
      >
        <div
          className="flex cursor-move items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2.5"
          onPointerDown={(event) => startInteraction(event, "drag")}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">
              {videoSurface === "popout" ? "Video is open in popout" : "Video popout closed"}
            </p>
            <p className="truncate text-xs text-[var(--color-subtle)]">
              {videoSurface === "popout" ? "The hub stays active here." : "Reconnect video in this panel."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {videoSurface === "popout" ? (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={focusPopout}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Focus
              </button>
            ) : null}
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={bringBackVideo}
              className="rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[var(--color-secondary-hover)]"
            >
              {videoSurface === "popout" ? "Bring Back" : "Reconnect"}
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const isSplit = videoSurface === "split";
  const renderedPanel = isMinimized
    ? clampPanel(panel, { width: getMinimizedPanelWidth(), height: 92 })
    : panel;

  return renderPortal(
    <aside
      ref={panelRef}
      className={
        isSplit
          ? "scribbl-video-split-panel flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl min-[1101px]:border-y-0 min-[1101px]:border-r-0"
          : "fixed overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      }
      style={
        isSplit
          ? ({ "--scribbl-split-panel-width": `${splitVideoWidth}px`, touchAction: "none", ...portalPanelStyle } as CSSProperties)
          : {
              left: renderedPanel.left,
              top: renderedPanel.top,
              width: isMinimized ? `min(${minimizedPanelWidth}px, calc(100vw - 24px))` : renderedPanel.width,
              height: isMinimized ? "auto" : panel.height,
              touchAction: "none",
              ...portalPanelStyle,
            }
      }
    >
      {isSplit ? (
        <div
          className="absolute left-0 top-0 hidden h-full w-2 cursor-col-resize touch-none min-[1101px]:flex min-[1101px]:items-center min-[1101px]:justify-center"
          style={{ zIndex: 501 }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            splitResizeRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startWidth: splitVideoWidth,
              maxWidth: getMaxSplitVideoWidth(window.innerWidth),
            };
          }}
        >
          <div className="h-10 w-0.5 rounded-full bg-white/20 transition-colors group-hover:bg-white/50" />
        </div>
      ) : null}
      <div
        className={
          isSplit
            ? "flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)]"
            : "flex cursor-move items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
        }
        onPointerDown={(event) => {
          if (!isSplit) {
            startInteraction(event, "drag");
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-medium">{isSplit ? "Split video" : "Video"}</p>
          {raisedHandCount > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--color-warning-dim)] px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
              ✋ {raisedHandCount}
            </span>
          ) : null}
          {pendingRequestCount > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--color-warning-dim)] px-2 py-0.5 text-xs font-semibold text-[var(--color-warning)]">
              📝 {pendingRequestCount}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isSplit ? (
            <>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => focusHubSection("#meeting-overview")}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Hub
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => focusHubSection("#meeting-notes")}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Open notes
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => focusHubSection("#meeting-chat")}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Open chat
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={openFullVideo}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Full
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={bringBackVideo}
                className="rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[var(--color-secondary-hover)]"
              >
                Float
              </button>
            </>
          ) : !isMinimized ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openSplitView}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              Split View
            </button>
          ) : null}
          {!isSplit && !isMinimized ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={openFullVideo}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              Full
            </button>
          ) : null}
          {!isSplit ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={toggleMinimized}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              {isMinimized ? "Show" : "Hide"}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onDismiss}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              title="Leave and dismiss"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {!isMinimized ? (
        <div
          className={isSplit ? "min-h-0 flex-1 overflow-hidden p-3" : "overflow-hidden"}
          style={isSplit ? undefined : { width: "100%", height: `calc(100% - 41px)` }}
        >
          <MeetingVideoRoom
            workspaceId={workspaceId}
            meetingId={meetingId}
            disabled={disabled}
            mode="floating"
            recording={recording}
            canRecord={canRecord}
            recordingReturnTo="current"
            permissions={permissions}
            autoJoin={autoJoin}
            onAfterLeave={() => {
              setAutoJoin(false);
              onAfterLeave?.();
            }}
          />
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
      {!isMinimized && !isSplit ? (
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

function loadStoredSplitWidth(): number {
  const fallback = typeof window !== "undefined"
    ? Math.floor(window.innerWidth * 0.42)
    : 500;
  if (typeof window === "undefined") return fallback;
  const maxWidth = getMaxSplitVideoWidth(window.innerWidth);
  const stored = window.localStorage.getItem(SPLIT_WIDTH_KEY);
  if (stored) {
    const n = parseInt(stored, 10);
    if (!isNaN(n) && n >= minSplitVideoWidth) return Math.min(n, maxWidth);
  }
  return Math.min(fallback, maxWidth);
}

function getStorageKey(meetingId: string) {
  return `scribbl-floating-video:v2:${meetingId}`;
}

function getChannelName(meetingId: string) {
  return `scribbl-video-${meetingId}`;
}

function scrollToHubSection(hash: string) {
  const targetId = hash.startsWith("#") ? hash.slice(1) : hash;

  window.dispatchEvent(
    new CustomEvent("scribbl:meeting-hub-navigate", {
      detail: { hash: `#${targetId}` },
    }),
  );

  window.setTimeout(() => {
    const target = document.getElementById(targetId);

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${targetId}`);
    }
  }, 75);
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

function getMinimizedPanelWidth() {
  if (typeof window === "undefined") {
    return minimizedPanelWidth;
  }

  return Math.min(minimizedPanelWidth, window.innerWidth - 24);
}

function clampPanel(panel: PanelState, bounds?: PanelBounds): PanelState {
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const maxWidth = Math.max(minPanelWidth, viewportWidth - 24);
  const maxHeight = Math.max(minPanelHeight, viewportHeight - 24);
  const width = Math.min(Math.max(panel.width, minPanelWidth), maxWidth);
  const height = Math.min(Math.max(panel.height, minPanelHeight), maxHeight);
  const positionWidth = bounds ? Math.min(Math.max(bounds.width, 1), maxWidth) : width;
  const positionHeight = bounds ? Math.min(Math.max(bounds.height, 1), maxHeight) : height;

  return {
    width,
    height,
    left: Math.min(Math.max(panel.left, 12), Math.max(12, viewportWidth - positionWidth - 12)),
    top: Math.min(Math.max(panel.top, 12), Math.max(12, viewportHeight - positionHeight - 12)),
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
