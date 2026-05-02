"use client";

import type { ReactNode } from "react";
import { LiveblocksProvider } from "@liveblocks/react/suspense";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LiveblocksProvider
      authEndpoint={async (room) => {
        const response = await fetch("/api/liveblocks-auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room,
          }),
        });

        return response.json();
      }}
      preventUnsavedChanges
    >
      {children}
    </LiveblocksProvider>
  );
}
