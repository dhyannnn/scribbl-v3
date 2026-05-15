"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useState } from "react";
import type { LsonObject } from "@liveblocks/client";
import { ClientSideSuspense, RoomProvider, useErrorListener, useStatus } from "@liveblocks/react/suspense";
import { isLiveblocksTimingVerbose, liveblocksNow, logLiveblocksClientTiming } from "@/lib/liveblocks-timing";

export function LiveblocksRoom({
  children,
  fallback,
  initialStorage,
  lazy = false,
  lazyRootMargin = "300px",
  providerKey,
  roomId,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  initialStorage?: LsonObject;
  lazy?: boolean;
  lazyRootMargin?: string;
  providerKey?: string;
  roomId: string;
}) {
  const [shouldMount, setShouldMount] = useState(!lazy);
  const lazyRef = useRef<HTMLDivElement | null>(null);
  const connectionFallback = fallback ?? <div className="text-xs text-[#777970]">Connecting collaborators...</div>;

  useEffect(() => {
    if (!lazy || shouldMount) {
      return;
    }

    const node = lazyRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldMount(true);
          observer.disconnect();
        }
      },
      { rootMargin: lazyRootMargin },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [lazy, lazyRootMargin, shouldMount]);

  if (!shouldMount) {
    return <div ref={lazyRef}>{connectionFallback}</div>;
  }

  return (
    <RoomProvider key={providerKey ?? roomId} id={roomId} initialPresence={{}} initialStorage={initialStorage}>
      <LiveblocksRoomTiming roomId={roomId} providerKey={providerKey} />
      <ClientSideSuspense fallback={connectionFallback}>{children}</ClientSideSuspense>
    </RoomProvider>
  );
}

function LiveblocksRoomTiming({ roomId, providerKey }: { roomId: string; providerKey?: string }) {
  const mountedAt = useRef(liveblocksNow());
  const lastStatusAt = useRef(liveblocksNow());
  const status = useStatus();

  useErrorListener((error) => {
    console.warn("[liveblocks]", {
      message: "Liveblocks room error",
      room: roomId,
      providerKey,
      status,
      error,
    });
  });

  useEffect(() => {
    const now = liveblocksNow();
    const elapsedMs = now - mountedAt.current;
    const statusMs = now - lastStatusAt.current;
    lastStatusAt.current = now;

    if (status === "connected" || status === "reconnecting" || status === "disconnected" || isLiveblocksTimingVerbose()) {
      logLiveblocksClientTiming("Liveblocks room status", {
        room: roomId,
        providerKey,
        status,
        statusMs: Math.round(statusMs),
      }, elapsedMs);
    }
  }, [providerKey, roomId, status]);

  return null;
}
