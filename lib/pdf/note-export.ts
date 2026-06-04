import "server-only";

import { chromium } from "playwright";
import katex from "katex";
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

export type NoteCommentEntry = {
  commentId: string;
  text: string;
  userName: string;
};

export type ExportNoteInput = {
  title: string;
  type: "TEXT" | "WHITEBOARD" | "MINDBOARD";
  ownerName: string;
  workspaceName: string;
  updatedAt: Date;
  contentJson: unknown;
  orientation?: string | null;
  marginTop?: number | null;
  marginBottom?: number | null;
  marginLeft?: number | null;
  marginRight?: number | null;
  comments?: NoteCommentEntry[];
};

// ── Dimensions ────────────────────────────────────────────────────────────────

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

export async function createNotePdfBuffer(note: ExportNoteInput) {
  if (note.type === "TEXT") {
    return createTextPdfBuffer(note);
  }

  return buildPdf(createWhiteboardPages(note));
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

async function createTextPdfBuffer(note: ExportNoteInput): Promise<Buffer> {
  const isLandscape = note.orientation === "landscape";
  // px → inches (96 dpi). Defaults: 72px = 0.75in
  const pxToIn = (px: number | null | undefined, fallback = 72) =>
    (px ?? fallback) / 96;
  const layout = {
    isLandscape,
    mt: pxToIn(note.marginTop),
    mb: pxToIn(note.marginBottom),
    ml: pxToIn(note.marginLeft),
    mr: pxToIn(note.marginRight),
  };

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // Viewport matches Letter paper at 96 dpi so line-wrapping is accurate
    const viewport = isLandscape ? { width: 1056, height: 816 } : { width: 816, height: 1056 };
    const page = await browser.newPage({ viewport });
    await page.setContent(createTextPdfHtml(note, layout), { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      // CSS @page sets size + orientation; body padding sets margins
      preferCSSPageSize: true,
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

type TextLayout = { isLandscape: boolean; mt: number; mb: number; ml: number; mr: number };

function annotateComments(html: string, comments: NoteCommentEntry[]) {
  if (comments.length === 0) return { html, annotated: [] as Array<{ num: number; userName: string; text: string }> };

  const byId = new Map(comments.map((c) => [c.commentId, c]));
  const seenOrder = new Map<string, number>();
  const annotated: Array<{ num: number; userName: string; text: string }> = [];

  const out = html.replace(
    /<span\b([^>]*)\bdata-comment-id="([^"]+)"([^>]*)>/g,
    (_match, pre, commentId, post) => {
      if (!seenOrder.has(commentId)) {
        const num = seenOrder.size + 1;
        seenOrder.set(commentId, num);
        const c = byId.get(commentId);
        if (c) annotated.push({ num, userName: c.userName, text: c.text });
      }
      const num = seenOrder.get(commentId)!;
      return `<span${pre}data-comment-id="${commentId}"${post}><sup style="color:#b45309;font-size:0.65em;font-weight:700;margin-left:1px">[${num}]</sup>`;
    },
  );

  return { html: out, annotated };
}

function createTextPdfHtml(note: ExportNoteInput, layout: TextLayout): string {
  const { isLandscape, mt, mb, ml, mr } = layout;
  const content = note.contentJson as TextContent | null;
  const rawHtml =
    content?.type === "tiptap" && typeof content.html === "string" && content.html.trim()
      ? sanitizeStoredHtml(content.html)
      : typeof content?.text === "string" && content.text.trim()
        ? `<p>${escapeHtml(content.text).replace(/\r?\n/g, "<br>")}</p>`
        : `<p class="empty">No note body yet.</p>`;
  const { html: annotatedHtml, annotated } = annotateComments(preRenderMath(rawHtml), note.comments ?? []);
  const bodyHtml = annotatedHtml;

  const commentsSection = annotated.length > 0 ? `
  <section style="margin-top:2.5em;border-top:2px solid #e4e4dc;padding-top:1.25em">
    <h2 style="font-size:0.85rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#62645c;margin:0 0 0.75em">Comments</h2>
    <ol style="margin:0;padding-left:1.25em;font-size:0.875rem;line-height:1.6;color:#20201d">
      ${annotated.map((c) => `<li style="margin-bottom:0.4em"><strong>${escapeHtml(c.userName)}</strong>: ${escapeHtml(c.text)}</li>`).join("")}
    </ol>
  </section>` : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css">
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        /* Margins via padding so @page margin:0 has no conflict */
        padding: ${mt}in ${mr}in ${mb}in ${ml}in;
        color: #20201d;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 16px;
        line-height: 1.75;
      }
      .content { min-width: 0; }
      .content p { margin: 0 0 0.75em; }
      .content p:last-child { margin-bottom: 0; }
      .content h1 { font-size: 2rem; font-weight: 700; margin: 1.25em 0 0.5em; line-height: 1.25; }
      .content h2 { font-size: 1.6rem; font-weight: 700; margin: 1.1em 0 0.45em; line-height: 1.3; }
      .content h3 { font-size: 1.3rem; font-weight: 600; margin: 1em 0 0.4em; line-height: 1.35; }
      .content h4 { font-size: 1.1rem; font-weight: 600; margin: 0.9em 0 0.35em; line-height: 1.4; }
      .content h5 { font-size: 1rem; font-weight: 600; margin: 0.85em 0 0.3em; line-height: 1.45; }
      .content h6 { font-size: 0.9rem; font-weight: 600; margin: 0.8em 0 0.3em; color: #62645c; line-height: 1.45; }
      .content ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0 0.75em; }
      .content ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0 0.75em; }
      .content li { margin: 0.2em 0; }
      .content ul[data-type="taskList"] { list-style: none; padding-left: 0.25em; }
      .content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
      .content ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 0.25em; }
      .content ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
      .content ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: #8a8c82; }
      .content blockquote {
        border-left: 4px solid #2f604b;
        color: #4d4f47;
        font-style: italic;
        margin: 0.75em 0;
        padding-left: 1em;
      }
      .content code {
        background: #f0f0eb;
        border-radius: 0.25em;
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 0.875em;
        padding: 0.1em 0.35em;
      }
      .content pre {
        background: #1e1e1e;
        border-radius: 0.5em;
        color: #d4d4d4;
        margin: 0.75em 0;
        overflow-wrap: anywhere;
        padding: 1em 1.25em;
        white-space: pre-wrap;
      }
      .content pre code { background: none; color: inherit; padding: 0; }
      .content hr {
        border: 0;
        border-top: 2px solid #e4e4dc;
        margin: 1.5em 0;
      }
      .content a { color: #2f604b; text-decoration: underline; }
      .content sub { vertical-align: sub; font-size: 0.8em; }
      .content sup { vertical-align: super; font-size: 0.8em; }
      .content table {
        border-collapse: collapse;
        border-radius: 0.375em;
        margin: 0.75em 0;
        overflow: hidden;
        width: 100%;
      }
      .content table td,
      .content table th {
        border: 1px solid #d8d8ce;
        min-width: 80px;
        padding: 0.5em 0.75em;
        vertical-align: top;
      }
      .content table th { background: #f5f5f0; font-weight: 600; }
      .content img { display: block; max-width: 100%; height: auto; margin: 0.75em 0; }
      .empty { color: #777970; font-style: italic; }
      .tiptap-comment { background: rgba(255, 212, 0, 0.35); border-bottom: 2px solid rgba(200, 160, 0, 0.5); }
      @page { size: Letter ${isLandscape ? "landscape" : "portrait"}; margin: 0; }
    </style>
  </head>
  <body>
    <main class="content">${bodyHtml}${commentsSection}</main>
  </body>
</html>`;
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

function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, output: "html" });
  } catch {
    return `<span class="katex-error">${escapeHtml(latex)}</span>`;
  }
}

function preRenderMath(html: string): string {
  // Pass 1: properly stored inlineMath nodes (span with data-type="inlineMath")
  let result = html.replace(
    /<span\b[^>]*\bdata-type="inlineMath"\b[^>]*>[\s\S]*?<\/span>/g,
    (match) => {
      const latexAttr = match.match(/\bdata-latex="([^"]*)"/);
      const displayAttr = match.match(/\bdata-display="([^"]*)"/);
      const latex = latexAttr?.[1]
        ? latexAttr[1]
            .replaceAll("&amp;", "&")
            .replaceAll("&lt;", "<")
            .replaceAll("&gt;", ">")
            .replaceAll("&quot;", '"')
            .replaceAll("&#39;", "'")
        : "";
      return renderLatex(latex, displayAttr?.[1] === "yes");
    },
  );

  // Pass 2: raw $$...$$ saved as plain text (fallback for notes saved before the fix)
  result = result.replace(/\$\$([^$<]+?)\$\$/g, (_, latex) =>
    renderLatex(latex.trim(), true),
  );

  // Pass 3: raw $...$ inline math
  result = result.replace(/(?<!\$)\$([^$<\n]+?)\$(?!\$)/g, (_, latex) =>
    renderLatex(latex.trim(), false),
  );

  return result;
}

function sanitizeStoredHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\shref=(["'])javascript:[\s\S]*?\1/gi, "")
    .replace(/\ssrc=(["'])javascript:[\s\S]*?\1/gi, "")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapePdfText(value: string): string {
  return `(${value
    .replaceAll(/[\u0000-\u001f\u007f-\uffff]/g, " ")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")})`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
