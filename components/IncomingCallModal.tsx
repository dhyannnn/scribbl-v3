"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acceptCall, declineCall } from "@/app/workspaces/[id]/meetings/actions";
import type { IncomingCall } from "@/lib/hooks/useIncomingCall";

type Props = {
  call: IncomingCall;
  onDismiss: () => void;
  onToast: (msg: string) => void;
};

export function IncomingCallModal({ call, onDismiss, onToast }: Props) {
  const router = useRouter();
  const [accepting, startAccept] = useTransition();
  const [declining, startDecline] = useTransition();

  function handleAccept() {
    startAccept(async () => {
      const result = await acceptCall(call.pendingCallId);
      if ("error" in result) {
        onToast("Call already ended");
        onDismiss();
        return;
      }
      onDismiss();
      router.push(`/workspaces/${result.workspaceId}/meetings/${result.meetingId}/video`);
    });
  }

  function handleDecline() {
    startDecline(async () => {
      await declineCall(call.pendingCallId);
      onDismiss();
    });
  }

  const initials = call.callerName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
          {/* Pulsing avatar ring */}
          <div className="relative mb-5 flex items-center justify-center">
            <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-green-400 opacity-20" />
            <span className="absolute inline-flex h-20 w-20 animate-ping rounded-full bg-green-400 opacity-10 [animation-delay:0.3s]" />
            {call.callerAvatarUrl ? (
              <img
                src={call.callerAvatarUrl}
                alt={call.callerName}
                className="relative z-10 h-16 w-16 rounded-full object-cover ring-4 ring-green-400/40"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] ring-4 ring-green-400/40">
                <span className="font-mono text-xl font-bold text-[var(--color-secondary)]">
                  {initials}
                </span>
              </div>
            )}
          </div>

          <h2 className="font-display text-lg font-bold text-[var(--color-text)]">
            {call.callerName}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">is calling you…</p>
        </div>

        {/* Accept / Decline */}
        <div className="flex items-center justify-center gap-6 border-t border-[var(--color-border)] px-6 py-5">
          <button
            type="button"
            onClick={handleDecline}
            disabled={declining || accepting}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600 disabled:opacity-60"
            aria-label="Decline"
          >
            {/* Phone off icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.91"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>

          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting || declining}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition hover:bg-green-600 disabled:opacity-60"
            aria-label="Accept"
          >
            {/* Phone icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.26 9.91 19.79 19.79 0 0 1 1.17 1.27 2 2 0 0 1 3.14 0h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 7.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 14.92z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
