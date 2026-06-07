"use client";

import { useEffect, useRef, useState } from "react";
import { useIncomingCall } from "@/lib/hooks/useIncomingCall";
import { IncomingCallModal } from "./IncomingCallModal";

type Props = {
  currentUserId: string;
};

export function IncomingCallListener({ currentUserId }: Props) {
  const { incomingCall, clearIncomingCall } = useIncomingCall(currentUserId);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Start/stop ringtone in sync with incoming call state
  useEffect(() => {
    if (incomingCall) {
      const audio = new Audio("/sounds/ringtone.mp3");
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
  }, [incomingCall]);

  // Auto-dismiss toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!incomingCall && !toast) return null;

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
