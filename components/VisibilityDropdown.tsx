"use client";

import { useState, useTransition } from "react";
import { updateNoteVisibility } from "@/app/workspaces/[id]/notes/actions";

export function VisibilityDropdown({
  workspaceId, noteId, current,
}: { workspaceId: string; noteId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [, startTx] = useTransition();

  function change(visibility: string) {
    setOpen(false);
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("noteId", noteId);
    fd.set("visibility", visibility);
    startTx(() => void updateNoteVisibility(fd));
  }

  const isPrivate = current === "PRIVATE";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isPrivate ? "Private — click to change" : "Shared with workspace — click to change"}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
      >
        {isPrivate ? <LockIcon /> : <GlobeIcon />}
        {isPrivate ? "Private" : "Shared"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
            <button
              type="button"
              onClick={() => change("PRIVATE")}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--color-surface-mid)] ${isPrivate ? "bg-[var(--color-surface-low)]" : ""}`}
            >
              <LockIcon className="mt-0.5 shrink-0 text-[var(--color-muted)]" />
              <div>
                <p className="text-xs font-semibold text-[var(--color-text)]">Private</p>
                <p className="text-[11px] text-[var(--color-subtle)]">Only you can view and edit</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => change("WORKSPACE_SHARED")}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--color-surface-mid)] ${!isPrivate ? "bg-[var(--color-surface-low)]" : ""}`}
            >
              <GlobeIcon className="mt-0.5 shrink-0 text-[var(--color-muted)]" />
              <div>
                <p className="text-xs font-semibold text-[var(--color-text)]">Shared with workspace</p>
                <p className="text-[11px] text-[var(--color-subtle)]">All workspace members can view</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}
