export const PAGE_W = 1600;
export const PAGE_H = 1000;

export type PageTemplate =
  | "blank"
  | "lined"
  | "dotted"
  | "grid"
  | "cover-blue"
  | "cover-green"
  | "cover-rose"
  | "cover-dark";

export const TEMPLATE_LABELS: Record<PageTemplate, string> = {
  blank: "Blank",
  lined: "Lined",
  dotted: "Dotted",
  grid: "Grid",
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

export function isCoverTemplate(t: string): boolean {
  return COVER_TEMPLATES.includes(t as PageTemplate);
}

export function getPageBackgroundShapeId(pageId: string) {
  return `shape:page-bg-${pageId.replace("page:", "")}` as `shape:${string}`;
}
