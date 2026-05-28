"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AccessRouteRefresher({
  intervalMs = 10000,
  preserveScroll = false,
}: {
  intervalMs?: number;
  preserveScroll?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refreshingRef = useRef(false);

  useEffect(() => {
    function restoreScroll(scrollY: number) {
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - scrollY) > 8) {
          window.scrollTo({ top: scrollY, behavior: "instant" });
        }
        refreshingRef.current = false;
      });
    }

    function refreshIfVisible() {
      if (document.visibilityState !== "visible" || refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;
      const scrollY = window.scrollY;
      startTransition(() => {
        router.refresh();
      });

      if (preserveScroll) {
        restoreScroll(scrollY);
      } else {
        refreshingRef.current = false;
      }
    }

    const intervalId = window.setInterval(refreshIfVisible, intervalMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [intervalMs, preserveScroll, router, startTransition]);

  return null;
}
