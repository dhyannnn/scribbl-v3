"use client";

import { useEffect, useRef } from "react";

export function LocalDateTimeInput({ className }: { className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const offsetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Store the user's UTC offset in minutes so the server can correct the time
    if (offsetRef.current) {
      offsetRef.current.value = String(new Date().getTimezoneOffset());
    }
  }, []);

  return (
    <>
      <input
        ref={inputRef}
        name="startsAt"
        type="datetime-local"
        required
        className={className}
      />
      <input ref={offsetRef} type="hidden" name="timezoneOffset" />
    </>
  );
}
