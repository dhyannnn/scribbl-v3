// Deterministic color utilities — no randomness, same input always produces same output.

const GRADIENTS: [string, string][] = [
  ["#6366f1", "#8b5cf6"],
  ["#3b82f6", "#06b6d4"],
  ["#10b981", "#3b82f6"],
  ["#ec4899", "#f43f5e"],
  ["#8b5cf6", "#ec4899"],
  ["#f59e0b", "#ef4444"],
  ["#14b8a6", "#6366f1"],
  ["#f97316", "#f59e0b"],
];

const SOLID_COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#ec4899",
  "#8b5cf6", "#f59e0b", "#14b8a6", "#ef4444",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getGradient(title: string): [string, string] {
  return GRADIENTS[hashString(title || "?") % GRADIENTS.length];
}

export function getSolidColor(name: string): string {
  return SOLID_COLORS[hashString(name || "?") % SOLID_COLORS.length];
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
