"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AccessRouteRefresher({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
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
  }, [intervalMs, router]);

  return null;
}
