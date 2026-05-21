"use client";

import { useActionState } from "react";
import { submitLandingFeedback, type LandingFeedbackState } from "@/app/landing-feedback/actions";

const initialState: LandingFeedbackState = {
  ok: false,
  message: "",
};

export function LandingFeedbackForm() {
  const [state, formAction, pending] = useActionState(submitLandingFeedback, initialState);

  return (
    <form action={formAction} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
      {state.ok ? (
        <div className="rounded-2xl border border-[var(--color-success-dim)] bg-[var(--color-success-dim)] p-5">
          <p className="font-display text-xl font-bold text-[var(--color-success)]">Thank you.</p>
          <p className="mt-2 leading-7 text-[var(--color-success)]">
            Your idea landed with the Scribbl team.
          </p>
        </div>
      ) : null}

      {state.message && !state.ok ? (
        <p className="mb-4 rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-danger-dim)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">
          {state.message}
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-bold text-[var(--color-text)]">What would you like to see?</span>
        <textarea
          name="feedback"
          required
          minLength={8}
          rows={6}
          className="mt-2 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-6 text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-subtle)] focus:border-[var(--color-secondary)]"
          placeholder="Tell us what would make Scribbl better for your workflow."
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-bold text-[var(--color-text)]">Email</span>
        <input
          name="email"
          type="email"
          required
          className="mt-2 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-subtle)] focus:border-[var(--color-secondary)]"
          placeholder="you@example.com"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send feedback"}
      </button>
    </form>
  );
}
