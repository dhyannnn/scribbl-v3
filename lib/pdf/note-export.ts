import "server-only";

type TextContent = {
  text?: string;
  type?: string;
  html?: string;
};

type Stroke = {
  points: {
    x: number;
    y: number;
  }[];
};

type WhiteboardPage = {
  id: string;
  title: string;
  strokes: Stroke[];
};

type ExportNoteInput = {
  title: string;
  type: "TEXT" | "WHITEBOARD";
  ownerName: string;
  workspaceName: string;
  updatedAt: Date;
  contentJson: unknown;
};

type PdfObject = {
  id: number;
  body: string | Buffer;
};

const pageWidth = 612;
const pageHeight = 792;
const margin = 54;

export function createNotePdfBuffer(note: ExportNoteInput) {
  const pages = note.type === "WHITEBOARD" ? createWhiteboardPages(note) : createTextPages(note);
  return buildPdf(pages);
}

export function createPdfFileName(title: string) {
  const safeTitle = title
    .trim()
    .replaceAll(/[/\\]/g, "-")
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return `${safeTitle || "scribbl-note"}.pdf`;
}

function createTextPages(note: ExportNoteInput) {
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
  const pages: string[] = [];
  let cursorY = pageHeight - margin;
  let stream = ["BT", "/F1 12 Tf", "14 TL", `${margin} ${cursorY} Td`];

  lines.forEach((line, index) => {
    const isTitle = index === 0;
    const isMeta = index === 1;
    const fontSize = isTitle ? 18 : isMeta ? 10 : 12;
    const leading = isTitle ? 22 : isMeta ? 14 : 16;

    if (cursorY < margin + leading) {
      stream.push("ET");
      pages.push(stream.join("\n"));
      cursorY = pageHeight - margin;
      stream = ["BT", "/F1 12 Tf", "14 TL", `${margin} ${cursorY} Td`];
    }

    stream.push(`/F1 ${fontSize} Tf`);
    stream.push(`${escapePdfText(line)} Tj`);
    stream.push(`0 -${leading} Td`);
    cursorY -= leading;
  });

  stream.push("ET");
  pages.push(stream.join("\n"));
  return pages;
}

function createWhiteboardPages(note: ExportNoteInput) {
  const pages = getWhiteboardPages(note.contentJson);

  return pages.map((page, index) => {
    const stream = [
      "BT",
      "/F1 18 Tf",
      `${margin} ${pageHeight - margin} Td`,
      `${escapePdfText(note.title)} Tj`,
      "0 -22 Td",
      "/F1 10 Tf",
      `${escapePdfText(`${note.workspaceName} / ${note.ownerName} / updated ${formatDate(note.updatedAt)}`)} Tj`,
      "0 -18 Td",
      `${escapePdfText(`${page.title || `Page ${index + 1}`} / ${index + 1} of ${pages.length}`)} Tj`,
      "ET",
      "0.185 0.376 0.294 RG",
      "2 w",
      ...page.strokes.flatMap((stroke) => createStrokeCommands(stroke)),
    ];

    return stream.join("\n");
  });
}

function createStrokeCommands(stroke: Stroke) {
  if (stroke.points.length === 0) {
    return [];
  }

  const scale = Math.min((pageWidth - margin * 2) / 960, (pageHeight - margin * 2 - 56) / 540);
  const drawingWidth = 960 * scale;
  const drawingHeight = 540 * scale;
  const originX = (pageWidth - drawingWidth) / 2;
  const originY = margin;
  const [firstPoint, ...remainingPoints] = stroke.points;
  const commands = [`${formatNumber(originX + firstPoint.x * scale)} ${formatNumber(originY + drawingHeight - firstPoint.y * scale)} m`];

  remainingPoints.forEach((point) => {
    commands.push(`${formatNumber(originX + point.x * scale)} ${formatNumber(originY + drawingHeight - point.y * scale)} l`);
  });

  commands.push("S");
  return commands;
}

function buildPdf(pageStreams: string[]) {
  const objects: PdfObject[] = [];
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  const pageIds: number[] = [];

  const contentObjects = pageStreams.map((stream) => {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    objects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    });
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    return contentId;
  });

  objects.unshift(
    {
      id: catalogId,
      body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
    },
    {
      id: pagesId,
      body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contentObjects.length} >>`,
    },
    {
      id: fontId,
      body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    },
  );

  objects.sort((a, b) => a.id - b.id);

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets = [0];

  objects.forEach((object) => {
    offsets[object.id] = Buffer.concat(chunks).length;
    chunks.push(Buffer.from(`${object.id} 0 obj\n`, "utf8"));
    chunks.push(Buffer.isBuffer(object.body) ? object.body : Buffer.from(object.body, "utf8"));
    chunks.push(Buffer.from("\nendobj\n", "utf8"));
  });

  const xrefOffset = Buffer.concat(chunks).length;
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...objects.map((object) => `${String(offsets[object.id]).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  chunks.push(Buffer.from(xref, "utf8"));
  return Buffer.concat(chunks);
}

function wrapText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxChars) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function getWhiteboardPages(contentJson: unknown) {
  const content = contentJson as { pages?: unknown; strokes?: unknown } | null;

  if (Array.isArray(content?.pages)) {
    const pages = content.pages.filter(isWhiteboardPage);

    if (pages.length > 0) {
      return pages;
    }
  }

  return [
    {
      id: "page-1",
      title: "Page 1",
      strokes: Array.isArray(content?.strokes) ? content.strokes.filter(isStroke) : [],
    },
  ];
}

function isWhiteboardPage(value: unknown): value is WhiteboardPage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybePage = value as { id?: unknown; title?: unknown; strokes?: unknown };

  return (
    typeof maybePage.id === "string" &&
    typeof maybePage.title === "string" &&
    Array.isArray(maybePage.strokes) &&
    maybePage.strokes.every(isStroke)
  );
}

function isStroke(value: unknown): value is Stroke {
  if (!value || typeof value !== "object" || !("points" in value)) {
    return false;
  }

  const maybeStroke = value as { points?: unknown };
  return (
    Array.isArray(maybeStroke.points) &&
    maybeStroke.points.every(
      (point) =>
        point &&
        typeof point === "object" &&
        typeof (point as { x?: unknown }).x === "number" &&
        typeof (point as { y?: unknown }).y === "number",
    )
  );
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

function escapePdfText(value: string) {
  return `(${value.replaceAll(/[\u0000-\u001f\u007f-\uffff]/g, " ").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")})`;
}

function formatNumber(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
