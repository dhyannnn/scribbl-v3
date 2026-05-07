"use client";

import { PendingSubmitButton } from "@/components/PendingSubmitButton";

export function ScheduleMeetingSubmitButton() {
  return (
    <PendingSubmitButton
      pendingLabel="Scheduling..."
      className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
    >
      Schedule
    </PendingSubmitButton>
  );
}
