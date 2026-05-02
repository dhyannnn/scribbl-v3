"use client";

import { cancelMeeting } from "./actions";

type CancelMeetingFormProps = {
  meetingId: string;
  workspaceId: string;
};

export function CancelMeetingForm({ meetingId, workspaceId }: CancelMeetingFormProps) {
  return (
    <form
      action={cancelMeeting}
      className="grid gap-3 rounded-md border border-[#ead1cd] bg-[#fff7f5] p-4"
      onSubmit={(event) => {
        if (!window.confirm("Cancel this meeting? Participants will keep the record, but RSVP and editing will stop.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <label className="grid gap-2">
        <span className="text-sm font-medium text-[#7a3434]">Cancellation reason</span>
        <textarea
          name="cancellationReason"
          rows={2}
          placeholder="Optional note for why this session is canceled."
          className="resize-y rounded-md border border-[#deb7b0] bg-white p-3 text-sm leading-6 outline-none transition focus:border-[#b65b5b]"
        />
      </label>
      <div className="flex justify-end">
        <button className="rounded-md border border-[#b65b5b] bg-white px-4 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-[#fff0ed]">
          Cancel Meeting
        </button>
      </div>
    </form>
  );
}
