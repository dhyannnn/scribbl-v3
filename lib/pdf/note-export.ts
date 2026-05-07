import "server-only";

import { PAGE_H, PAGE_W } from "@/lib/tldraw/page-config";

// ── Text note types ───────────────────────────────────────────────────────────

type TextContent = {
  text?: string;
  type?: string;
  html?: string;
};

// ── Tldraw snapshot types ─────────────────────────────────────────────────────

type TldrawRecord = {
  id: string;
  typeName: string;
  type?: string;
  x?: number;
  y?: number;
  isLocked?: boolean;
  parentId?: string;
  props?: Record<string, unknown>;
};

type TldrawSnapshot = {
  store: Record<string, TldrawRecord>;
};

// ── PDF plumbing ──────────────────────────────────────────────────────────────

type PdfObject = {
  id: number;
  body: string;
};

type PageSpec = {
  stream: string;
  w: number;
  h: number;
};

export type ExportNoteInput = {
  title: string;
  type: "TEXT" | "WHITEBOARD";
  ownerName: string;
  workspaceName: string;
  updatedAt: Date;
  contentJson: unknown;
};

// ── Dimensions ────────────────────────────────────────────────────────────────

// Text pages: portrait US Letter
const TEXT_W = 612;
const TEXT_H = 792;
const TEXT_MARGIN = 54;

// Whiteboard pages: landscape, exact 8:5 ratio matching the canvas
const WB_W = 792;
const WB_H = Math.round(WB_W * (PAGE_H / PAGE_W)); // 495
const WB_MARGIN = 36;
const WB_HEADER_H = 28; // thin title + meta strip

// Drawing area within a whiteboard page
const DRAW_LEFT = WB_MARGIN;
const DRAW_BOTTOM = WB_MARGIN;
const DRAW_W = WB_W - WB_MARGIN * 2; // 720
const DRAW_H = WB_H - WB_MARGIN * 2 - WB_HEADER_H; // 393
const DRAW_SCALE = Math.min(DRAW_W / PAGE_W, DRAW_H / PAGE_H); // 0.393
const DRAW_X_OFFSET = (DRAW_W - PAGE_W * DRAW_SCALE) / 2; // horizontal centering

// ── Entry point ───────────────────────────────────────────────────────────────

export function createNotePdfBuffer(note: ExportNoteInput) {
  const pages =
    note.type === "WHITEBOARD" ? createWhiteboardPages(note) : createTextPages(note);
  return buildPdf(pages);
}

export function createPdfFileName(title: string) {
  const safe = title
    .trim()
    .replaceAll(/[/\\]/g, "-")
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "scribbl-note"}.pdf`;
}

// ── Text pages ────────────────────────────────────────────────────────────────

function createTextPages(note: ExportNoteInput): PageSpec[] {
  const content = note.contentJson as TextContent | null;
  const rawText =
    content?.type === "tiptap" && typeof content.html === "string"
      ? htmlToPlainText(content.html)
      : typeof content?.text === "string"
        ? content.text
        : "";
  const text = rawText.trim() || "No note body yet.";
  const lines = [
    note.title,
    `${note.workspaceName} / ${note.ownerName} / updated ${formatDate(note.updatedAt)}`,
    "",
    ...text.split(/\r?\n/),
  ].flatMap((line, index) =>
    index < 2 ? wrapText(line, 78) : line ? wrapText(line, 92) : [""],
  );

  const pages: PageSpec[] = [];
  let cursorY = TEXT_H - TEXT_MARGIN;
  let stream = ["BT", "/F1 12 Tf", "14 TL", `${TEXT_MARGIN} ${cursorY} Td`];

  lines.forEach((line, index) => {
    const isTitle = index === 0;
    const isMeta = index === 1;
    const fontSize = isTitle ? 18 : isMeta ? 10 : 12;
    const leading = isTitle ? 22 : isMeta ? 14 : 16;

    if (cursorY < TEXT_MARGIN + leading) {
      stream.push("ET");
      pages.push({ stream: stream.join("\n"), w: TEXT_W, h: TEXT_H });
      cursorY = TEXT_H - TEXT_MARGIN;
      stream = ["BT", "/F1 12 Tf", "14 TL", `${TEXT_MARGIN} ${cursorY} Td`];
    }

    stream.push(`/F1 ${fontSize} Tf`);
    stream.push(`${escapePdfText(line)} Tj`);
    stream.push(`0 -${leading} Td`);
    cursorY -= leading;
  });

  stream.push("ET");
  pages.push({ stream: stream.join("\n"), w: TEXT_W, h: TEXT_H });
  return pages;
}

// ── Whiteboard pages ──────────────────────────────────────────────────────────

function createWhiteboardPages(note: ExportNoteInput): PageSpec[] {
  const snapshot = getTldrawSnapshot(note.contentJson);
  if (!snapshot) return [blankWhiteboardPage(note, 1, 1)];

  const records = Object.values(snapshot.store);

  // Collect pages in order
  const tldrawPages = records
    .filter((r) => r.typeName === "page")
    .sort((a, b) => ((a as { index?: string }).index ?? "").localeCompare((b as { index?: string }).index ?? ""));

  if (tldrawPages.length === 0) return [blankWhiteboardPage(note, 1, 1)];

  return tldrawPages.map((page, i) => {
    const pageShapes = records.filter(
      (r) => r.typeName === "shape" && r.parentId === page.id && r.type !== "page-background",
    );
    const meta = `${note.workspaceName} / ${note.ownerName} / ${formatDate(note.updatedAt)}`;
    const pageLabel = tldrawPages.length > 1 ? `  ${i + 1}/${tldrawPages.length}` : "";

    const headerY = WB_H - WB_MARGIN - 10;
    const stream = [
      // Header
      "BT",
      "/F1 9 Tf",
      `${WB_MARGIN} ${headerY} Td`,
      `${escapePdfText(`${note.title}${pageLabel}`)} Tj`,
      "/F1 7 Tf",
      `0 -12 Td`,
      `${escapePdfText(meta)} Tj`,
      "ET",
      // Thin separator line under header
      `${fmt(WB_MARGIN)} ${fmt(WB_H - WB_MARGIN - WB_HEADER_H)} m`,
      `${fmt(WB_W - WB_MARGIN)} ${fmt(WB_H - WB_MARGIN - WB_HEADER_H)} l`,
      "0.8 0.8 0.8 RG",
      "0.5 w",
      "S",
      // Shapes
      ...renderShapes(pageShapes),
    ];

    return { stream: stream.join("\n"), w: WB_W, h: WB_H };
  });
}

function blankWhiteboardPage(note: ExportNoteInput, page: number, total: number): PageSpec {
  const headerY = WB_H - WB_MARGIN - 10;
  const pageLabel = total > 1 ? `  ${page}/${total}` : "";
  const stream = [
    "BT",
    "/F1 9 Tf",
    `${WB_MARGIN} ${headerY} Td`,
    `${escapePdfText(`${note.title}${pageLabel}`)} Tj`,
    "ET",
  ];
  return { stream: stream.join("\n"), w: WB_W, h: WB_H };
}

// ── Shape rendering ───────────────────────────────────────────────────────────

function renderShapes(shapes: TldrawRecord[]): string[] {
  const cmds: string[] = [];
  for (const shape of shapes) {
    const shapeCmds = renderShape(shape);
    if (shapeCmds.length > 0) cmds.push(...shapeCmds);
  }
  return cmds;
}

function renderShape(shape: TldrawRecord): string[] {
  switch (shape.type) {
    case "draw":
      return renderDraw(shape);
    case "geo":
      return renderGeo(shape);
    case "text":
      return renderText(shape);
    case "note":
      return renderNote(shape);
    case "arrow":
      return renderArrow(shape);
    default:
      return [];
  }
}

function tx(x: number, shapeX = 0): number {
  return DRAW_LEFT + DRAW_X_OFFSET + (shapeX + x) * DRAW_SCALE;
}

function ty(y: number, shapeY = 0): number {
  // PDF y is bottom-up; tldraw y is top-down
  return DRAW_BOTTOM + (PAGE_H - (shapeY + y)) * DRAW_SCALE;
}

function renderDraw(shape: TldrawRecord): string[] {
  const p = shape.props ?? {};
  const segments = p.segments as Array<{ type: string; points: Array<{ x: number; y: number }> }> | undefined;
  if (!segments?.length) return [];

  const color = tldrawColorToPdf(String(p.color ?? "black"));
  const w = tldrawSizeToWidth(String(p.size ?? "m"));
  const cmds: string[] = [`${color} RG`, `${w} w`];

  for (const seg of segments) {
    const pts = seg.points ?? [];
    if (pts.length === 0) continue;
    cmds.push(`${fmt(tx(pts[0].x, shape.x))} ${fmt(ty(pts[0].y, shape.y))} m`);
    for (let i = 1; i < pts.length; i++) {
      cmds.push(`${fmt(tx(pts[i].x, shape.x))} ${fmt(ty(pts[i].y, shape.y))} l`);
    }
    cmds.push("S");
  }
  return cmds;
}

function renderGeo(shape: TldrawRecord): string[] {
  const p = shape.props ?? {};
  const w = Number(p.w ?? 100);
  const h = Number(p.h ?? 100);
  const color = tldrawColorToPdf(String(p.color ?? "black"));
  const strokeW = tldrawSizeToWidth(String(p.size ?? "m"));
  const fill = p.fill !== "none" && p.fill !== undefined;

  const x1 = tx(0, shape.x);
  const y1 = ty(h, shape.y); // bottom-left in PDF
  const pw = w * DRAW_SCALE;
  const ph = h * DRAW_SCALE;

  if (p.geo === "ellipse") {
    // Approximate ellipse with 4 bezier curves
    const cx = tx(w / 2, shape.x);
    const cy = ty(h / 2, shape.y);
    const rx = pw / 2;
    const ry = ph / 2;
    const k = 0.5523;
    const cmds = [
      `${color} RG`,
      `${strokeW} w`,
      `${fmt(cx)} ${fmt(cy + ry)} m`,
      `${fmt(cx + rx * k)} ${fmt(cy + ry)} ${fmt(cx + rx)} ${fmt(cy + ry * k)} ${fmt(cx + rx)} ${fmt(cy)} c`,
      `${fmt(cx + rx)} ${fmt(cy - ry * k)} ${fmt(cx + rx * k)} ${fmt(cy - ry)} ${fmt(cx)} ${fmt(cy - ry)} c`,
      `${fmt(cx - rx * k)} ${fmt(cy - ry)} ${fmt(cx - rx)} ${fmt(cy - ry * k)} ${fmt(cx - rx)} ${fmt(cy)} c`,
      `${fmt(cx - rx)} ${fmt(cy + ry * k)} ${fmt(cx - rx * k)} ${fmt(cy + ry)} ${fmt(cx)} ${fmt(cy + ry)} c`,
      fill ? "b" : "S",
    ];
    return cmds;
  }

  // Default: rectangle
  const cmds = [
    `${color} RG`,
    `${strokeW} w`,
    `${fmt(x1)} ${fmt(y1)} ${fmt(pw)} ${fmt(ph)} re`,
    fill ? "b" : "S",
  ];
  return cmds;
}

function renderText(shape: TldrawRecord): string[] {
  const p = shape.props ?? {};
  const text = String(p.text ?? "").trim();
  if (!text) return [];
  const color = tldrawColorToPdf(String(p.color ?? "black"));
  const fontSize = tldrawSizeToFontSize(String(p.size ?? "m"));
  const x = tx(0, shape.x);
  const y = ty(fontSize, shape.y); // baseline
  return [
    "BT",
    `/F1 ${fontSize} Tf`,
    `${color} rg`,
    `${fmt(x)} ${fmt(y)} Td`,
    `${escapePdfText(text)} Tj`,
    "ET",
  ];
}

function renderNote(shape: TldrawRecord): string[] {
  const p = shape.props ?? {};
  const text = String(p.text ?? "").trim();
  const NOTE_SIZE = 200;
  const noteW = NOTE_SIZE * DRAW_SCALE;
  const noteH = NOTE_SIZE * DRAW_SCALE;
  const x1 = tx(0, shape.x);
  const y1 = ty(NOTE_SIZE, shape.y);

  const cmds: string[] = [
    "0.98 0.96 0.5 rg", // yellow fill
    "0.8 0.8 0.3 RG",
    "0.5 w",
    `${fmt(x1)} ${fmt(y1)} ${fmt(noteW)} ${fmt(noteH)} re`,
    "b",
  ];

  if (text) {
    const fontSize = 7;
    const padding = 4 * DRAW_SCALE;
    cmds.push(
      "BT",
      `/F1 ${fontSize} Tf`,
      "0 0 0 rg",
      `${fmt(x1 + padding)} ${fmt(y1 + noteH - padding - fontSize)} Td`,
      `${escapePdfText(text.slice(0, 60))} Tj`,
      "ET",
    );
  }
  return cmds;
}

function renderArrow(shape: TldrawRecord): string[] {
  const p = shape.props ?? {};
  const bend = p.bend as { x?: number; y?: number } | undefined;
  const start = p.start as { x?: number; y?: number } | undefined;
  const end = p.end as { x?: number; y?: number } | undefined;
  if (!start || !end) return [];

  const color = tldrawColorToPdf(String(p.color ?? "black"));
  const strokeW = tldrawSizeToWidth(String(p.size ?? "m"));
  const x1 = tx(Number(start.x ?? 0), shape.x);
  const y1 = ty(Number(start.y ?? 0), shape.y);
  const x2 = tx(Number(end.x ?? 0), shape.x);
  const y2 = ty(Number(end.y ?? 0), shape.y);

  void bend;
  return [
    `${color} RG`,
    `${strokeW} w`,
    `${fmt(x1)} ${fmt(y1)} m`,
    `${fmt(x2)} ${fmt(y2)} l`,
    "S",
  ];
}

// ── PDF builder ───────────────────────────────────────────────────────────────

function buildPdf(pages: PageSpec[]): Buffer {
  const objects: PdfObject[] = [];
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds: number[] = [];

  pages.forEach(({ stream, w, h }) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    });
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
  });

  objects.unshift(
    { id: catalogId, body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>` },
    {
      id: pagesId,
      body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    },
    { id: fontId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
  );

  objects.sort((a, b) => a.id - b.id);

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets: number[] = [0];

  objects.forEach((obj) => {
    offsets[obj.id] = Buffer.concat(chunks).length;
    chunks.push(
      Buffer.from(`${obj.id} 0 obj\n`, "utf8"),
      Buffer.from(obj.body, "utf8"),
      Buffer.from("\nendobj\n", "utf8"),
    );
  });

  const xrefOffset = Buffer.concat(chunks).length;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...objects.map((obj) => `${String(offsets[obj.id]).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  chunks.push(Buffer.from(xref, "utf8"));
  return Buffer.concat(chunks) as Buffer;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTldrawSnapshot(contentJson: unknown): TldrawSnapshot | null {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  if (c?.type !== "tldraw" || !c.snapshot) return null;
  const snap = c.snapshot as { store?: unknown };
  if (!snap.store || typeof snap.store !== "object") return null;
  return snap as TldrawSnapshot;
}

const COLOR_MAP: Record<string, string> = {
  black: "0 0 0",
  blue: "0.18 0.38 0.78",
  green: "0.18 0.55 0.18",
  grey: "0.5 0.5 0.5",
  "light-blue": "0.5 0.7 0.9",
  "light-green": "0.5 0.8 0.5",
  "light-red": "0.9 0.5 0.5",
  "light-violet": "0.72 0.5 0.9",
  orange: "0.88 0.49 0.1",
  red: "0.78 0.18 0.18",
  violet: "0.5 0.2 0.8",
  white: "1 1 1",
  yellow: "0.88 0.78 0.18",
};

function tldrawColorToPdf(color: string): string {
  return COLOR_MAP[color] ?? "0 0 0";
}

function tldrawSizeToWidth(size: string): number {
  return { s: 1, m: 2, l: 3.5, xl: 5 }[size] ?? 2;
}

function tldrawSizeToFontSize(size: string): number {
  return { s: 8, m: 11, l: 16, xl: 22 }[size] ?? 11;
}

function fmt(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapePdfText(value: string): string {
  return `(${value
    .replaceAll(/[ --￿]/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")})`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
