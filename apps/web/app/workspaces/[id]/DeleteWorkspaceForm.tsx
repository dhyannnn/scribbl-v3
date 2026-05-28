"use client";

import { useRef, useState } from "react";
import { deleteWorkspace } from "./actions";

export function DeleteWorkspaceForm({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const matches = typed === workspaceName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setPending(true);
    const fd = new FormData(formRef.current!);
    await deleteWorkspace(fd);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[var(--color-danger-dim)]"
      >
        Delete workspace
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-danger-dim)] p-5">
      <p className="text-sm font-semibold text-[var(--color-danger)]">Delete workspace</p>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        This will permanently delete <strong>{workspaceName}</strong> including all members, channels, and groups. Notes, files, and meetings are detached but not removed from storage. This cannot be undone.
      </p>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        Type <strong>{workspaceName}</strong> to confirm:
      </p>
      <form ref={formRef} onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input
          name="confirmName"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={workspaceName}
          autoComplete="off"
          className="min-h-10 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm outline-none transition focus:border-[var(--color-danger)]"
          style={{ minWidth: "180px" }}
        />
        <button
          type="submit"
          disabled={!matches || pending}
          className="rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-40"
        >
          {pending ? "Deleting..." : "Delete permanently"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTyped(""); }}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
