"use client";

import { useEffect, useState, useTransition } from "react";
import { updateDarkMode } from "@/app/(app)/account/actions";

const THEME_EVENT = "scribbl:theme";

export function useTheme(initialDark: boolean) {
  const [dark, setDark] = useState(initialDark);
  const [, startTransition] = useTransition();

  // Sync with other theme toggles mounted on the same page
  useEffect(() => {
    function onThemeChange(e: Event) {
      setDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    }
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try { localStorage.setItem("scribbl-theme", next ? "dark" : "light"); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { dark: next } }));
    startTransition(() => { void updateDarkMode(next); });
  }

  return { dark, toggle };
}
