export const noteTitleMaxLength = 120;

export function sanitizeNoteTitle(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  const title = String(value ?? "").replaceAll(/\s+/g, " ").trim();
  const safeFallback = fallback.trim() || "Untitled note";

  return (title || safeFallback).slice(0, noteTitleMaxLength);
}

export function createDefaultNoteTitle({
  scope,
  type,
  collaborative = false,
  date = new Date(),
  timeZone,
}: {
  scope: "PRIVATE" | "WORKSPACE_SHARED";
  type: "TEXT" | "WHITEBOARD";
  collaborative?: boolean;
  date?: Date;
  timeZone?: string;
}) {
  const scopeLabel =
    scope === "PRIVATE" ? "Private" : collaborative ? "Collaborative" : "Shared";
  const typeLabel = type === "TEXT" ? "note" : "whiteboard";
  const timestamp = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });

  return `${scopeLabel} ${typeLabel} - ${timestamp}`;
}
