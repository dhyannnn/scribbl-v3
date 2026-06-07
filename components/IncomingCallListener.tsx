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

  // Auto-decline if already in a video room
  useEffect(() => {
    if (incomingCall && isInVideoRoom) {
      void declineCall(incomingCall.pendingCallId);
      clearIncomingCall();
    }
  }, [incomingCall, isInVideoRoom, clearIncomingCall]);

  // Start/stop ringtone in sync with incoming call state
  useEffect(() => {
    if (incomingCall && !isInVideoRoom) {
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
  }, [incomingCall, isInVideoRoom]);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if ((!incomingCall || isInVideoRoom) && !toast) return null;

  return (
    <>
      {incomingCall ? (
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
