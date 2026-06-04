"use client";

import { useEffect, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import type { Editor } from "@tiptap/react";

type Snapshot = {
  id: string;
  createdAt: string;
  user: { displayName: string };
};

type Props = {
  noteId: string;
  workspaceId: string;
  editor: Editor | null;
  onClose: () => void;
};

export function NoteHistoryPanel({ noteId, workspaceId, editor, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/notes/${noteId}/snapshots`)
      .then((r) => r.json())
      .then((data) => setSnapshots(data as Snapshot[]))
      .finally(() => setLoading(false));
  }, [noteId]);

  async function restore(snapshotId: string) {
    setRestoring(snapshotId);
    try {
      const { restoreNoteSnapshot } = await import("@/app/workspaces/[id]/notes/actions");
      const result = await restoreNoteSnapshot(noteId, workspaceId, snapshotId);
      if (result?.contentJson && editor) {
        const json = result.contentJson as { type?: string; content?: unknown[] };
        const doc = json.type === "tiptap" ? json.content : json;
        editor.commands.setContent(doc as Parameters<typeof editor.commands.setContent>[0]);
      }
      onClose();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--color-border)] px-4">
        <span className="text-xs font-semibold text-[var(--color-text)]">Version History</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="p-4 text-xs text-[var(--color-subtle)]">Loading…</p>}
        {!loading && snapshots.length === 0 && (
          <p className="p-4 text-xs text-[var(--color-subtle)]">No saved snapshots yet. Snapshots are saved automatically every 30 minutes of editing.</p>
        )}
        {snapshots.map((s) => {
          const date = new Date(s.createdAt);
          return (
            <div
              key={s.id}
              onMouseEnter={() => setPreviewId(s.id)}
              onMouseLeave={() => setPreviewId(null)}
              className={`border-b border-[var(--color-border)] px-4 py-3 transition ${previewId === s.id ? "bg-[var(--color-surface-low)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[var(--color-text)]">
                    {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="truncate text-[10px] text-[var(--color-subtle)]">{s.user.displayName}</p>
                </div>
                <button
                  type="button"
                  title="Restore this version"
                  onClick={() => void restore(s.id)}
                  disabled={restoring === s.id}
                  className="shrink-0 rounded-full border border-[var(--color-border)] p-1.5 text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-40"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
