"use client";

import { PendingSubmitButton } from "@/components/PendingSubmitButton";

export function ScheduleMeetingSubmitButton() {
  return (
    <PendingSubmitButton
      pendingLabel="Scheduling..."
      className="min-h-10 w-full rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Schedule
    </PendingSubmitButton>
  );
}
