// Parse a datetime-local string (e.g. "2026-05-23T11:49") as if it's a wall-clock
// time in the given IANA timezone, and return the correct UTC Date.
export function parseLocalDateTimeInZone(localStr: string, timeZone: string): Date {
  // Treat the string as UTC for a reference point, then compute the real offset.
  const utcRef = new Date(localStr + ":00Z");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcRef);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0");

  // What the target timezone shows for utcRef
  const tzMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // some engines return 24 for midnight
    get("minute"),
    get("second"),
  );

  // Offset = UTC - what_tz_shows_for_UTC. Apply it to our actual local time.
  return new Date(utcRef.getTime() + (utcRef.getTime() - tzMs));
}

// Format a UTC Date as a datetime-local input value ("YYYY-MM-DDTHH:MM")
// in the given IANA timezone, so the input pre-fills with the user's local time.
export function formatDateTimeLocalInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour").padStart(2, "0");

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
