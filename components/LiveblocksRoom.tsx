"use client";

import type { ReactNode } from "react";
import type { LsonObject } from "@liveblocks/client";
import { ClientSideSuspense, RoomProvider } from "@liveblocks/react/suspense";

export function LiveblocksRoom({
  children,
  initialStorage,
  roomId,
}: {
  children: ReactNode;
  initialStorage?: LsonObject;
  roomId: string;
}) {
  return (
    <RoomProvider id={roomId} initialPresence={{}} initialStorage={initialStorage}>
      <ClientSideSuspense fallback={<div className="text-xs text-[#777970]">Connecting collaborators...</div>}>
        {children}
      </ClientSideSuspense>
    </RoomProvider>
  );
}
