"use client";

import { useEffect, useRef } from "react";

// Hidden input that sends the browser's IANA timezone to a server action.
// Defaults to "UTC" on the server render to avoid hydration mismatch.
export function TimezoneInput({ name = "userTimezone" }: { name?: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }, []);

  return <input ref={ref} type="hidden" name={name} defaultValue="UTC" />;
}
