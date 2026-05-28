"use client";

import { useTheme } from "@/lib/use-theme";

export function AppearanceToggle({ initialDark }: { initialDark: boolean }) {
  const { dark, toggle } = useTheme(initialDark);

  return (
    <button type="button" role="switch" aria-checked={dark} onClick={toggle} className="relative shrink-0">
      <span className={`block h-6 w-10 rounded-full border transition ${dark ? "border-[var(--color-secondary)] bg-[var(--color-secondary)]" : "border-[var(--color-border)] bg-[var(--color-surface-high)]"}`} />
      <span className={`pointer-events-none absolute left-0.5 top-0.5 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${dark ? "translate-x-4" : ""}`} />
    </button>
  );
}
