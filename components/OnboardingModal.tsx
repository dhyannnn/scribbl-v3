"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "onboarding-complete";

type Step = {
  icon: string;
  title: string;
  body: string;
  hint?: string;
};

const STEPS: Step[] = [
  {
    icon: "✦",
    title: "Welcome to Scribbl",
    body: "Scribbl brings notes, whiteboards, meetings, files, and chat into one collaborative workspace. Let's take a quick tour.",
    hint: "Takes about 30 seconds",
  },
  {
    icon: "🗂️",
    title: "Workspaces & Meetings",
    body: "A workspace is your shared home base — one per class, team, or project. Inside it, you can schedule meetings for live sessions, and create notes or whiteboards that stick around afterward, whether or not they're tied to a meeting.",
    hint: "Meetings are for live sessions — notes and whiteboards are the lasting record",
  },
  {
    icon: "📝",
    title: "Notes & Whiteboards",
    body: "Create rich text notes with headings, math, code blocks, and tables — type / to open the command menu. Or switch to a whiteboard for freehand sketching and diagrams.",
    hint: "Type / in any note to see all available blocks",
  },
  {
    icon: "🎥",
    title: "Meetings & Real-Time",
    body: "Schedule meetings, join video calls, take shared notes, and record sessions — all in one place. Your workspace syncs live so every collaborator sees changes instantly.",
    hint: "Pro & Institution plans unlock recordings and shared whiteboards",
  },
  {
    icon: "⌘",
    title: "Power-User Shortcuts",
    body: "Press ⌘K anywhere to open the command palette and jump to any note, meeting, or workspace. Press / in the editor for block commands. Everything is keyboard-navigable.",
    hint: "You're all set — let's go!",
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done) setOpen(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  if (!open) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Skip */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Body */}
        <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
          <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-[var(--color-secondary-dim)] text-3xl leading-none">
            {current.icon}
          </div>
          <h2 className="font-display text-xl font-bold text-[var(--color-text)]">{current.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{current.body}</p>
          {current.hint && (
            <p className="mt-3 rounded-full bg-[var(--color-surface-low)] px-4 py-1.5 font-mono text-[11px] text-[var(--color-subtle)]">
              {current.hint}
            </p>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-5 bg-[var(--color-secondary)]"
                  : "w-1.5 bg-[var(--color-surface-high)]"
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:pointer-events-none disabled:opacity-0"
          >
            Back
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-[var(--color-secondary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            {step === STEPS.length - 1 ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
