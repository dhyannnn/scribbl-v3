"use client";

import { useActiveMeeting } from "@/components/ActiveMeetingContext";

export function VideoRejoinBanner() {
  const { activeMeeting, videoHidden, setVideoHidden } = useActiveMeeting();

  if (!activeMeeting || !videoHidden) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
      <p className="text-sm text-[var(--color-muted)]">Video panel was dismissed.</p>
      <button
        type="button"
        onClick={() => setVideoHidden(false)}
        className="shrink-0 rounded-full bg-[var(--color-secondary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
      >
        Rejoin video
      </button>
    </div>
  );
}
