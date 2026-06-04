"use client";

import { useMemo } from "react";
import { useIsDarkMode } from "@tldraw/editor";

export function usePillColors() {
  const isDark = useIsDarkMode();
  return useMemo(() => ({
    bg:        isDark ? "#1e1e1e"                  : "#f8f9fa",
    border:    isDark ? "rgba(255,255,255,0.12)"   : "rgba(0,0,0,0.10)",
    hover:     isDark ? "rgba(255,255,255,0.08)"   : "rgba(0,0,0,0.06)",
    active:    isDark ? "rgba(255,255,255,0.16)"   : "rgba(0,0,0,0.10)",
    divider:   isDark ? "rgba(255,255,255,0.10)"   : "rgba(0,0,0,0.10)",
    text:      isDark ? "rgba(255,255,255,0.85)"   : "rgba(0,0,0,0.80)",
    popoverBg: isDark ? "#1e1e1e"                  : "#ffffff",
    shadow:    isDark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.12)",
  }), [isDark]);
}
