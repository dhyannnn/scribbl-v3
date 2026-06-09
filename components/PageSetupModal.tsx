"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  noteId: string;
  workspaceId: string;
  initialOrientation: string;
  initialMarginTop: number;
  initialMarginBottom: number;
  initialMarginLeft: number;
  initialMarginRight: number;
  onSave?: (settings: { orientation: string; marginTop: number; marginBottom: number; marginLeft: number; marginRight: number }) => void;
  onClose: () => void;
};

// Margins stored as px (72px = 1 inch at 96 dpi). UI shows inches.
const PX_PER_INCH = 96;

function pxToIn(px: number) { return Math.round((px / PX_PER_INCH) * 100) / 100; }
function inToPx(inches: number) { return Math.round(inches * PX_PER_INCH); }

export function PageSetupModal({
  noteId, workspaceId,
  initialOrientation,
  initialMarginTop, initialMarginBottom, initialMarginLeft, initialMarginRight,
  onSave,
  onClose,
}: Props) {
  const [orientation, setOrientation] = useState(initialOrientation === "landscape" ? "landscape" : "portrait");
  const [mt, setMt] = useState(pxToIn(initialMarginTop));
  const [mb, setMb] = useState(pxToIn(initialMarginBottom));
  const [ml, setMl] = useState(pxToIn(initialMarginLeft));
  const [mr, setMr] = useState(pxToIn(initialMarginRight));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const settings = {
      orientation,
      marginTop: inToPx(mt),
      marginBottom: inToPx(mb),
      marginLeft: inToPx(ml),
      marginRight: inToPx(mr),
    };
    try {
      const { updateNotePageSetup } = await import("@/app/workspaces/[id]/notes/actions");
      await updateNotePageSetup(noteId, workspaceId, settings);
      onSave?.(settings);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-20 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-80 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">Page Setup</h2>

        {/* Orientation */}
        <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">Orientation</p>
        <div className="mb-4 flex gap-2">
          {(["portrait", "landscape"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrientation(o)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium transition ${
                orientation === o
                  ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
              }`}
            >
              {o === "portrait" ? "Portrait" : "Landscape"}
            </button>
          ))}
        </div>

        {/* Margins */}
        <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">Margins (inches)</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[
            { label: "Top", value: mt, set: setMt },
            { label: "Bottom", value: mb, set: setMb },
            { label: "Left", value: ml, set: setMl },
            { label: "Right", value: mr, set: setMr },
          ].map(({ label, value, set }) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="text-[10px] text-[var(--color-subtle)]">{label}</span>
              <input
                type="number"
                min={0}
                max={4}
                step={0.25}
                value={value}
                onChange={(e) => set(Math.max(0, Math.min(4, Number(e.target.value))))}
                className={inputCls}
              />
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-[var(--color-border)] py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded-full bg-[var(--color-primary)] py-2 text-xs font-medium text-white transition hover:opacity-80 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
