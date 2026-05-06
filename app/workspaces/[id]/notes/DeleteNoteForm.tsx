"use client";

import { publishScribblClientEvent } from "@/app/Providers";
import { deleteWorkspaceNote } from "./actions";

type DeleteNoteFormProps = {
  isMeetingAttached: boolean;
  noteId: string;
  workspaceId: string;
};

export function DeleteNoteForm({
  isMeetingAttached,
  noteId,
  workspaceId,
}: DeleteNoteFormProps) {
  return (
    <form
      action={deleteWorkspaceNote}
      onSubmit={(event) => {
        const message = isMeetingAttached
          ? "Delete this note? It will also be removed from meeting artifacts."
          : "Delete this note?";

        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }

        publishScribblClientEvent({
          type: "note-deleted",
          noteId,
          workspaceId,
        });
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="noteId" value={noteId} />
      <button className="rounded-md border border-[#c8c8bd] px-3 py-2 text-sm font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5]">
        Delete
      </button>
    </form>
  );
}
