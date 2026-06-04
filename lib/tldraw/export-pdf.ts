"use client";

import { Box, getSvgAsImage, type Editor } from "tldraw";
import { PAGE_H, PAGE_W } from "./page-config";

// PDF points per canvas unit — 72 DPI reference unit
const PDF_SCALE = 72 / 96; // ≈ 0.75 — maps canvas px to PDF points at 96dpi
const MAX_PDF_W = 842; // A4 landscape width in points (≈ 11.7in)

// Export scale — higher = better quality JPEG
const EXPORT_SCALE = 2;

function canvasToPdfDims(w: number, h: number): { pdfW: number; pdfH: number } {
  const pdfW = Math.min(Math.round(w * PDF_SCALE), MAX_PDF_W);
  const pdfH = Math.round(h * (pdfW / w));
  return { pdfW, pdfH };
}

export async function exportWhiteboardPdf(
  editor: Editor,
  title: string,
  isMindboard = false,
) {
  const pages = editor.getPages();
  const currentPageId = editor.getCurrentPageId();

  type PageRecord = { bytes: Uint8Array; pdfW: number; pdfH: number; imgW: number; imgH: number };
  const pageRecords: PageRecord[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    editor.setCurrentPage(page.id);

    const shapeIds = [...editor.getCurrentPageShapeIds()];

    let bounds: Box;
    if (isMindboard) {
      const contentBounds = editor.getCurrentPageBounds();
      if (!contentBounds || shapeIds.length === 0) continue;
      const PAD = 48;
      bounds = new Box(
        contentBounds.x - PAD,
        contentBounds.y - PAD,
        contentBounds.w + PAD * 2,
        contentBounds.h + PAD * 2,
      );
    } else {
      // Read dimensions from the PageBackgroundShape so orientation is respected
      const bgShape = editor.getCurrentPageShapes().find((s) => s.type === "page-background");
      const w = (bgShape?.props as { w?: number } | undefined)?.w ?? PAGE_W;
      const h = (bgShape?.props as { h?: number } | undefined)?.h ?? PAGE_H;
      bounds = new Box(0, 0, w, h);
    }

    const svg = await editor.getSvg(shapeIds, {
      bounds,
      padding: 0,
      background: false,
    });

    if (!svg) continue;

    const svgString = new XMLSerializer().serializeToString(svg);
    const { pdfW, pdfH } = canvasToPdfDims(bounds.w, bounds.h);
    const imgW = Math.round(bounds.w * EXPORT_SCALE);
    const imgH = Math.round(bounds.h * EXPORT_SCALE);

    const blob = await getSvgAsImage(editor, svgString, {
      type: "jpeg",
      quality: 0.92,
      scale: EXPORT_SCALE,
      width: bounds.w,
      height: bounds.h,
    });

    if (blob) {
      const bytes = await blobToUint8Array(blob);
      pageRecords.push({ bytes, pdfW, pdfH, imgW, imgH });
    }
  }

  editor.setCurrentPage(currentPageId);

  if (pageRecords.length === 0) return;

  const pdfBytes = buildJpegPdf(pageRecords);

  const url = URL.createObjectURL(new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function sanitizeFilename(name: string): string {
  return name.trim().replaceAll(/[/\\]/g, "-").replaceAll(/[^a-zA-Z0-9._ -]/g, "").trim().slice(0, 120) || "whiteboard";
}

// ── PDF builder ────────────────────────────────────────────────────────────────
// Builds a minimal PDF with one JPEG image per page (DCTDecode filter).
// Each page can have its own dimensions, supporting mixed orientations.

type PageData = { bytes: Uint8Array; pdfW: number; pdfH: number; imgW: number; imgH: number };

function buildJpegPdf(pages: PageData[]): Uint8Array {
  const enc = new TextEncoder();
  const s = (str: string) => enc.encode(str);

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];

  function push(data: Uint8Array) {
    chunks.push(data);
    offset += data.length;
  }
  function pushStr(str: string) {
    push(s(str));
  }
  function markObj(id: number) {
    offsets[id] = offset;
  }

  push(s("%PDF-1.4\n"));

  const catalogId = 1;
  const pagesId = 2;
  const imgObjId = (i: number) => 3 + i * 3;
  const contentObjId = (i: number) => 3 + i * 3 + 1;
  const pageObjId = (i: number) => 3 + i * 3 + 2;
  const totalObjects = 2 + pages.length * 3;

  for (let i = 0; i < pages.length; i++) {
    const { bytes, pdfW, pdfH, imgW, imgH } = pages[i];

    markObj(imgObjId(i));
    pushStr(`${imgObjId(i)} 0 obj\n`);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    push(bytes);
    pushStr("\nendstream\nendobj\n");

    const imgCmd = `q ${pdfW} 0 0 ${pdfH} 0 0 cm /Im${i} Do Q\n`;

    markObj(contentObjId(i));
    pushStr(`${contentObjId(i)} 0 obj\n<< /Length ${imgCmd.length} >>\nstream\n`);
    pushStr(imgCmd);
    pushStr("endstream\nendobj\n");

    markObj(pageObjId(i));
    pushStr(`${pageObjId(i)} 0 obj\n`);
    pushStr(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfW} ${pdfH}] /Resources << /XObject << /Im${i} ${imgObjId(i)} 0 R >> >> /Contents ${contentObjId(i)} 0 R >>\n`,
    );
    pushStr("endobj\n");
  }

  markObj(catalogId);
  pushStr(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  const pageKids = pages.map((_, i) => `${pageObjId(i)} 0 R`).join(" ");
  markObj(pagesId);
  pushStr(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj\n`);

  const xrefOffset = offset;
  const xrefLines = [
    "xref",
    `0 ${totalObjects + 1}`,
    "0000000000 65535 f ",
    ...Array.from({ length: totalObjects }, (_, i) =>
      `${String(offsets[i + 1] ?? 0).padStart(10, "0")} 00000 n `,
    ),
    "trailer",
    `<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  pushStr(xrefLines);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}
