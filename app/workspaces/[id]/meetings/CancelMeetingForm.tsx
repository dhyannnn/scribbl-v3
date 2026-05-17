"use client";

import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { cancelMeeting } from "./actions";

type CancelMeetingFormProps = {
  meetingId: string;
  workspaceId: string;
  isSeries?: boolean;
};

export function CancelMeetingForm({ meetingId, workspaceId, isSeries = false }: CancelMeetingFormProps) {
  return (
    <form
      action={cancelMeeting}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-danger-dim)] p-4"
      onSubmit={(event) => {
        const msg = isSeries
          ? "Cancel this meeting or all future occurrences? This cannot be undone."
          : "Cancel this meeting? Participants keep the record but RSVP and editing will stop.";
        if (!window.confirm(msg)) event.preventDefault();
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="meetingId" value={meetingId} />

      {isSeries ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold text-[var(--color-danger)]">Cancel scope</legend>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              name="cancelScope"
              value="THIS"
              defaultChecked
              className="accent-[var(--color-danger)]"
            />
            This meeting only
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              name="cancelScope"
              value="THIS_AND_FUTURE"
              className="accent-[var(--color-danger)]"
            />
            This and all future occurrences
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="cancelScope" value="THIS" />
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-[var(--color-danger)]">Cancellation reason</span>
        <textarea
          name="cancellationReason"
          rows={2}
          placeholder="Optional note for why this session is canceled."
          className="resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-6 outline-none transition focus:border-[var(--color-danger)]"
        />
      </label>

      <div className="flex justify-end">
        <PendingSubmitButton
          pendingLabel="Canceling..."
          className="rounded-full border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-white disabled:opacity-50"
        >
          Cancel Meeting
        </PendingSubmitButton>
      </div>
    </form>
  );
}
