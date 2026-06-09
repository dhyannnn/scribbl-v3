"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type IncomingCall = {
  pendingCallId: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string | null;
  meetingId: string;
  workspaceId: string;
  expiresAt: string;
};

export function useIncomingCall(userId: string) {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const fetchedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`pending-calls:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "PendingCall",
          filter: `calleeId=eq.${userId}`,
        },
        async (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string };
            if (fetchedIds.current.has(row.id)) return;
            fetchedIds.current.add(row.id);

            try {
              const res = await fetch(`/api/pending-call/${row.id}`, {
                credentials: "same-origin",
              });
              if (!res.ok) return;
              const data = await res.json() as IncomingCall & { pendingCallId: string };
              setIncomingCall(data);
            } catch {
              // network error — skip
            }
          }

          if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            setIncomingCall((prev) =>
              prev?.pendingCallId === row.id ? null : prev,
            );
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  function clearIncomingCall() {
    setIncomingCall(null);
  }

  return { incomingCall, clearIncomingCall };
}
