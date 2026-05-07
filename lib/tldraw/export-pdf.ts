"use client";

import { Box, getSvgAsImage, type Editor } from "tldraw";
import { PAGE_H, PAGE_W } from "./page-config";

// Landscape page matching the 8:5 whiteboard ratio
const PDF_W = 792;
const PDF_H = Math.round(PDF_W * (PAGE_H / PAGE_W)); // 495

// Export scale — higher = better quality JPEG, larger file
const EXPORT_SCALE = 2;

export async function exportWhiteboardPdf(
  editor: Editor,
  title: string,
) {
  const pages = editor.getPages();
  const currentPageId = editor.getCurrentPageId();
  const pageBlobs: Blob[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    editor.setCurrentPage(page.id);

    const shapeIds = [...editor.getCurrentPageShapeIds()];
    const svg = await editor.getSvg(shapeIds, {
      bounds: new Box(0, 0, PAGE_W, PAGE_H),
      padding: 0,
      background: false,
    });

    if (!svg) continue;

    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = await getSvgAsImage(editor, svgString, {
      type: "jpeg",
      quality: 0.92,
      scale: EXPORT_SCALE,
      width: PAGE_W,
      height: PAGE_H,
    });

    if (blob) pageBlobs.push(blob);
  }

  editor.setCurrentPage(currentPageId);

  if (pageBlobs.length === 0) return;

  const jpegPages = await Promise.all(
    pageBlobs.map(async (blob) => {
      const bytes = await blobToUint8Array(blob);
      return { bytes };
    }),
  );

  const pdfBytes = buildJpegPdf(jpegPages, PDF_W, PDF_H, PAGE_W * EXPORT_SCALE, PAGE_H * EXPORT_SCALE);

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
// Uses Uint8Array throughout so binary JPEG data is never corrupted.

function buildJpegPdf(
  pages: { bytes: Uint8Array }[],
  pdfW: number,
  pdfH: number,
  imgW: number,
  imgH: number,
): Uint8Array {
  const enc = new TextEncoder();
  const s = (str: string) => enc.encode(str);

  // Collect all chunks and track byte offsets
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

  // Object IDs:
  // 1 = Catalog, 2 = Pages
  // For each page i (0-based):
  //   imgObjId(i)     = 3 + i * 3
  //   contentObjId(i) = 3 + i * 3 + 1
  //   pageObjId(i)    = 3 + i * 3 + 2
  const catalogId = 1;
  const pagesId = 2;
  const imgObjId = (i: number) => 3 + i * 3;
  const contentObjId = (i: number) => 3 + i * 3 + 1;
  const pageObjId = (i: number) => 3 + i * 3 + 2;
  const totalObjects = 2 + pages.length * 3;

  // Image + content + page objects for each page
  for (let i = 0; i < pages.length; i++) {
    const { bytes } = pages[i];

    // Image XObject (JPEG / DCTDecode)
    markObj(imgObjId(i));
    pushStr(`${imgObjId(i)} 0 obj\n`);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    push(bytes);
    pushStr("\nendstream\nendobj\n");

    // Page content stream: draw the rendered whiteboard image full-page.
    const imgCmd = `q ${pdfW} 0 0 ${pdfH} 0 0 cm /Im${i} Do Q\n`;
    const contentStream = imgCmd;

    markObj(contentObjId(i));
    pushStr(`${contentObjId(i)} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`);
    pushStr(contentStream);
    pushStr("endstream\nendobj\n");

    // Page object
    markObj(pageObjId(i));
    pushStr(`${pageObjId(i)} 0 obj\n`);
    pushStr(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfW} ${pdfH}] /Resources << /XObject << /Im${i} ${imgObjId(i)} 0 R >> >> /Contents ${contentObjId(i)} 0 R >>\n`,
    );
    pushStr("endobj\n");
  }

  // Catalog
  markObj(catalogId);
  pushStr(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);

  // Pages
  const pageKids = pages.map((_, i) => `${pageObjId(i)} 0 R`).join(" ");
  markObj(pagesId);
  pushStr(`${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj\n`);

  // xref table
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

  // Concatenate all chunks
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}
