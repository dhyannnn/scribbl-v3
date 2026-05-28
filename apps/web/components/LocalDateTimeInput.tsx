"use client";

import { useEffect, useRef } from "react";
import { formatDateTimeLocalInZone } from "@/lib/timezone";

export function LocalDatetimeInput({
  name,
  utcIso,
  required,
  className,
}: {
  name: string;
  utcIso?: string;
  required?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && utcIso) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      ref.current.value = formatDateTimeLocalInZone(new Date(utcIso), tz);
    }
  }, [utcIso]);

  // When editing: defaultValue is in UTC for SSR/hydration consistency;
  // the effect corrects it to the browser's local timezone immediately on mount.
  // When creating: no defaultValue — user picks the time.
  return (
    <input
      ref={ref}
      name={name}
      type="datetime-local"
      required={required}
      defaultValue={utcIso ? formatDateTimeLocalInZone(new Date(utcIso), "UTC") : undefined}
      className={className}
    />
  );
}
