"use client";

import { useEffect, useState } from "react";

type FormatOptions = {
  date?: boolean;
  time?: boolean;
  short?: boolean;
};

function formatDate(date: Date, opts: FormatOptions): string {
  const { date: showDate = true, time: showTime = true, short = false } = opts;

  if (showDate && showTime) {
    return date.toLocaleString([], {
      month: short ? "short" : "long",
      day: "numeric",
      year: short ? undefined : "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (showDate) {
    return date.toLocaleDateString([], {
      month: short ? "short" : "long",
      day: "numeric",
      year: short ? undefined : "numeric",
    });
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function LocalTime({
  date,
  dateOnly = false,
  timeOnly = false,
  short = false,
  fallback,
}: {
  date: Date | string;
  dateOnly?: boolean;
  timeOnly?: boolean;
  short?: boolean;
  fallback?: string;
}) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    const d = typeof date === "string" ? new Date(date) : date;
    setFormatted(
      formatDate(d, { date: !timeOnly, time: !dateOnly, short })
    );
  }, [date, dateOnly, timeOnly, short]);

  // Server render: show fallback or UTC representation to avoid hydration mismatch
  if (formatted === null) {
    if (fallback) return <span>{fallback}</span>;
    const d = typeof date === "string" ? new Date(date) : date;
    return <span suppressHydrationWarning>{formatDate(d, { date: !timeOnly, time: !dateOnly, short })}</span>;
  }

  return <span>{formatted}</span>;
}
