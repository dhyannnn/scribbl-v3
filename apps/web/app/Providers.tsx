"use client";

import { useEffect, type ReactNode } from "react";
import { LiveblocksProvider } from "@liveblocks/react/suspense";
import { useRouter } from "next/navigation";
import { liveblocksNow, logLiveblocksClientTiming } from "@/lib/liveblocks-timing";

type ScribblClientEvent =
  | {
      type: "invite-accepted";
      href: string;
    }
  | {
      type: "note-deleted";
      noteId: string;
      workspaceId: string;
    };

const clientEventChannel = "scribbl-client-events";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function handleClientEvent(event: ScribblClientEvent) {
      if (event.type === "invite-accepted") {
        if (window.location.pathname !== event.href) {
          window.location.assign(event.href);
        }

        return;
      }

      if (event.type === "note-deleted") {
        router.refresh();
        window.setTimeout(() => router.refresh(), 1000);
      }
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key !== clientEventChannel || !event.newValue) {
        return;
      }

      try {
        handleClientEvent(JSON.parse(event.newValue) as ScribblClientEvent);
      } catch {
        // Ignore malformed cross-tab events.
      }
    }

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(clientEventChannel) : null;

    if (channel) {
      channel.onmessage = (event: MessageEvent<ScribblClientEvent>) => handleClientEvent(event.data);
    }

    window.addEventListener("storage", handleStorageEvent);

    return () => {
      channel?.close();
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [router]);

  return (
    <LiveblocksProvider
      authEndpoint={async (room) => {
        const startedAt = liveblocksNow();
        const response = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room,
          }),
        });
        const fetchedAt = liveblocksNow();
        const body = await response.json();
        const parsedAt = liveblocksNow();

        logLiveblocksClientTiming("Liveblocks auth endpoint", {
          room,
          status: response.status,
          ok: response.ok,
          fetchMs: Math.round(fetchedAt - startedAt),
          parseMs: Math.round(parsedAt - fetchedAt),
        }, parsedAt - startedAt);

        return body;
      }}
      preventUnsavedChanges
    >
      {children}
    </LiveblocksProvider>
  );
}

export function publishScribblClientEvent(event: ScribblClientEvent) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(clientEventChannel);
    channel.postMessage(event);
    channel.close();
  }

  window.localStorage.setItem(
    clientEventChannel,
    JSON.stringify({
      ...event,
      sentAt: Date.now(),
    }),
  );
}
