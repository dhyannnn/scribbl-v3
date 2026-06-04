export const PAGE_W = 1600;
export const PAGE_H = 1000;

export type PageTemplate =
  | "blank"
  | "lined"
  | "dotted"
  | "grid"
  | "blank-dark"
  | "lined-dark"
  | "dotted-dark"
  | "grid-dark"
  | "cover-blue"
  | "cover-green"
  | "cover-rose"
  | "cover-dark";

export const TEMPLATE_LABELS: Record<PageTemplate, string> = {
  blank: "Blank",
  lined: "Lined",
  dotted: "Dotted",
  grid: "Grid",
  "blank-dark": "Blank",
  "lined-dark": "Lined",
  "dotted-dark": "Dotted",
  "grid-dark": "Grid",
  "cover-blue": "Blue",
  "cover-green": "Green",
  "cover-rose": "Rose",
  "cover-dark": "Dark",
};

export const COVER_COLORS: Record<string, string> = {
  "cover-blue": "#1e40af",
  "cover-green": "#166534",
  "cover-rose": "#9f1239",
  "cover-dark": "#1c1917",
};

export const COVER_TEMPLATES: PageTemplate[] = [
  "cover-blue",
  "cover-green",
  "cover-rose",
  "cover-dark",
];

export const LIGHT_TEMPLATES: PageTemplate[] = ["blank", "lined", "dotted", "grid"];

export const DARK_TEMPLATES: PageTemplate[] = ["blank-dark", "lined-dark", "dotted-dark", "grid-dark"];

export function isCoverTemplate(t: string): boolean {
  return COVER_TEMPLATES.includes(t as PageTemplate);
}

export function isDarkTemplate(t: string): boolean {
  return DARK_TEMPLATES.includes(t as PageTemplate);
}

export function getPageBackgroundShapeId(pageId: string) {
  return `shape:page-bg-${pageId.replace("page:", "")}` as `shape:${string}`;
}

// ── Page orientations ─────────────────────────────────────────────────────────

export type PageOrientation = "landscape" | "portrait" | "widescreen" | "square";

export interface OrientationPreset {
  id: PageOrientation;
  label: string;
  w: number;
  h: number;
}

export const ORIENTATION_PRESETS: OrientationPreset[] = [
  { id: "landscape",  label: "Landscape",  w: 1600, h: 1000 },
  { id: "portrait",   label: "Portrait",   w: 1000, h: 1600 },
  { id: "widescreen", label: "Widescreen", w: 1600, h: 900  },
  { id: "square",     label: "Square",     w: 1200, h: 1200 },
];

export function getOrientationPreset(id: PageOrientation): OrientationPreset {
  return ORIENTATION_PRESETS.find((p) => p.id === id) ?? ORIENTATION_PRESETS[0];
}

export function detectOrientation(w: number, h: number): PageOrientation {
  for (const p of ORIENTATION_PRESETS) {
    if (p.w === w && p.h === h) return p.id;
  }
  return w >= h ? "landscape" : "portrait";
}
