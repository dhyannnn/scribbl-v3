"use client";

import { useEffect, useState } from "react";
import { X, CheckCircle2, CornerDownRight, Trash2 } from "lucide-react";

type NoteCommentRow = {
  id: string;
  commentId: string;
  text: string;
  resolvedAt: string | null;
  parentCommentId: string | null;
  createdAt: string;
  user: { displayName: string };
};

type Props = {
  noteId: string;
  workspaceId: string;
  onClose: () => void;
  onCommentDeleted?: (commentId: string) => void;
};

export function NoteCommentsPanel({ noteId, workspaceId, onClose, onCommentDeleted }: Props) {
  const [comments, setComments] = useState<NoteCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch(`/api/notes/${noteId}/comments`);
    if (res.ok) {
      setComments((await res.json()) as NoteCommentRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [noteId]);

  async function resolve(commentId: string) {
    const { resolveNoteComment } = await import("@/app/workspaces/[id]/notes/actions");
    await resolveNoteComment(noteId, workspaceId, commentId);
    void load();
  }

  async function deleteComment(commentId: string) {
    const { deleteNoteComment } = await import("@/app/workspaces/[id]/notes/actions");
    await deleteNoteComment(noteId, workspaceId, commentId);
    onCommentDeleted?.(commentId);
    void load();
  }

  async function submitReply() {
    if (!replyTo || !replyText.trim()) return;
    setSubmitting(true);
    try {
      const { addNoteCommentReply } = await import("@/app/workspaces/[id]/notes/actions");
      await addNoteCommentReply(noteId, workspaceId, replyTo, replyText.trim());
      setReplyText("");
      setReplyTo(null);
      void load();
    } finally {
      setSubmitting(false);
    }
  }

  const roots = comments.filter((c) => !c.parentCommentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentCommentId === parentId);

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex h-10 items-center justify-between border-b border-[var(--color-border)] px-4">
        <span className="text-xs font-semibold text-[var(--color-text)]">Comments</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs">
        {loading && <p className="text-[var(--color-subtle)]">Loading…</p>}
        {!loading && roots.length === 0 && (
          <p className="text-[var(--color-subtle)]">No comments yet. Select text in the editor to add one.</p>
        )}
        {roots.map((c) => (
          <div key={c.id} className={`mb-3 rounded-xl border p-3 ${c.resolvedAt ? "opacity-50" : "border-[var(--color-border)]"}`}>
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="font-medium text-[var(--color-text)]">{c.user.displayName}</span>
              <div className="flex items-center gap-1">
                {!c.resolvedAt && (
                  <button
                    type="button"
                    title="Resolve"
                    onClick={() => void resolve(c.commentId)}
                    className="shrink-0 text-[var(--color-success)] hover:opacity-80"
                  >
                    <CheckCircle2 size={13} />
                  </button>
                )}
                <button
                  type="button"
                  title="Delete comment"
                  onClick={() => void deleteComment(c.commentId)}
                  className="shrink-0 text-[var(--color-danger)] hover:opacity-80"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <p className="mb-2 text-[var(--color-muted)]">{c.text}</p>

            {/* Replies */}
            {replies(c.commentId).map((r) => (
              <div key={r.id} className="mt-1 flex gap-1.5 pl-3">
                <CornerDownRight size={11} className="mt-0.5 shrink-0 text-[var(--color-subtle)]" />
                <div>
                  <span className="font-medium text-[var(--color-text)]">{r.user.displayName}: </span>
                  <span className="text-[var(--color-muted)]">{r.text}</span>
                </div>
              </div>
            ))}

            {/* Reply input */}
            {replyTo === c.commentId ? (
              <div className="mt-2 flex gap-1">
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submitReply(); } }}
                  placeholder="Reply…"
                  className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs outline-none focus:border-[var(--color-secondary)]"
                />
                <button
                  type="button"
                  onClick={() => void submitReply()}
                  disabled={submitting || !replyText.trim()}
                  className="rounded-full bg-[var(--color-secondary)] px-2.5 py-1 text-[10px] font-medium text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            ) : (
              !c.resolvedAt && (
                <button
                  type="button"
                  onClick={() => setReplyTo(c.commentId)}
                  className="mt-1 text-[10px] text-[var(--color-secondary)] hover:underline"
                >
                  Reply
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
