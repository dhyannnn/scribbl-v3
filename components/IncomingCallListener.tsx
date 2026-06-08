"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useIncomingCall } from "@/lib/hooks/useIncomingCall";
import { declineCall } from "@/app/workspaces/[id]/meetings/actions";
import { IncomingCallModal } from "./IncomingCallModal";

type Props = {
  currentUserId: string;
};

export function IncomingCallListener({ currentUserId }: Props) {
  const { incomingCall, clearIncomingCall } = useIncomingCall(currentUserId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pathname = usePathname();
  const isInVideoRoom = pathname?.endsWith("/video") ?? false;

  // Auto-decline only when in a *different* video room — not the incoming call's own room.
  // Without this guard, clicking the notification (which navigates to the call's video URL)
  // would immediately trigger a decline before the callee could join.
  const isInDifferentVideoRoom =
    isInVideoRoom && !!incomingCall && !pathname.includes(incomingCall.meetingId);

  useEffect(() => {
    if (incomingCall && isInDifferentVideoRoom) {
      void declineCall(incomingCall.pendingCallId);
      clearIncomingCall();
    }
  }, [incomingCall, isInDifferentVideoRoom, clearIncomingCall]);

  // Play ringtone while there's an incoming call and we haven't navigated to its room yet
  useEffect(() => {
    if (incomingCall && !isInDifferentVideoRoom) {
      const audio = new Audio("/sounds/mixkit-marimba-ringtone-1359.wav");
      audio.loop = true;
      audio.play().catch(() => {});
      audioRef.current = audio;
    } else {
      audioRef.current?.pause();
      audioRef.current = null;
    }

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [incomingCall, isInDifferentVideoRoom]);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Suppress modal if the callee has already navigated to this call's video room
  const isInThisCallsRoom =
    isInVideoRoom && !!incomingCall && pathname.includes(incomingCall.meetingId);
  if ((!incomingCall || isInThisCallsRoom) && !toast) return null;

  return (
    <>
      {incomingCall && !isInThisCallsRoom ? (
        <IncomingCallModal
          call={incomingCall}
          onDismiss={clearIncomingCall}
          onToast={setToast}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-lg">
          <p className="text-sm text-[var(--color-text)]">{toast}</p>
        </div>
      ) : null}
    </>
  );
}
