"use client";

const slowThresholdMs = 750;
const verboseStorageKey = "scribbl:liveblocks-timing";

export function liveblocksNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function isLiveblocksTimingVerbose() {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(verboseStorageKey) === "1";
  } catch {
    return false;
  }
}

export function logLiveblocksClientTiming(
  message: string,
  context: Record<string, unknown>,
  elapsedMs: number,
) {
  const roundedElapsedMs = Math.round(elapsedMs);
  const entry = {
    message,
    elapsedMs: roundedElapsedMs,
    ...context,
  };

  if (roundedElapsedMs >= slowThresholdMs) {
    console.warn("[liveblocks]", entry);
  } else if (isLiveblocksTimingVerbose()) {
    console.info("[liveblocks]", entry);
  }
}
