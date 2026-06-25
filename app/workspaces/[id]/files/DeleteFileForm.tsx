"use client";

import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { deleteWorkspaceFile } from "./actions";

type DeleteFileFormProps = {
  disabled: boolean;
  fileId: string;
  isMeetingAttached: boolean;
  workspaceId: string;
};

export function DeleteFileForm({
  disabled,
  fileId,
  isMeetingAttached,
  workspaceId,
}: DeleteFileFormProps) {
  return (
    <form
      action={deleteWorkspaceFile}
      onSubmit={(event) => {
        const message = isMeetingAttached
          ? "Delete this file? It will also be removed from any meetings it's attached to."
          : "Delete this file?";

        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="fileId" value={fileId} />
      <PendingSubmitButton
        className="rounded-md border border-[#c8c8bd] px-4 py-2 text-sm font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        pendingLabel="Deleting..."
      >
        Delete
      </PendingSubmitButton>
    </form>
  );
}
