"use client";

import { Copy, Edit2, ExternalLink, Unlink } from "lucide-react";
import { createPortal } from "react-dom";

type Props = {
  href: string;
  top: number;
  left: number;
  onCopy: () => void;
  onEdit: () => void;
  onUnlink: () => void;
};

export function LinkHoverPopover({ href, top, left, onCopy, onEdit, onUnlink }: Props) {
  const display = href.length > 42 ? href.slice(0, 39) + "…" : href;

  return createPortal(
    <div
      style={{ top, left }}
      className="fixed z-[9999] flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 shadow-xl"
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        onMouseDown={(e) => e.preventDefault()}
        className="flex max-w-[200px] items-center gap-1 truncate text-xs text-[var(--color-secondary)] hover:underline"
      >
        <ExternalLink size={11} className="shrink-0" />
        <span className="truncate">{display}</span>
      </a>
      <div className="mx-1 h-4 w-px shrink-0 bg-[var(--color-border)]" />
      <button
        type="button"
        title="Copy link"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCopy}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
      >
        <Copy size={11} />
      </button>
      <button
        type="button"
        title="Edit link"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onEdit}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
      >
        <Edit2 size={11} />
      </button>
      <button
        type="button"
        title="Unlink"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onUnlink}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
      >
        <Unlink size={11} />
      </button>
    </div>,
    document.body,
  );
}
