import { describe, expect, it } from "vitest";
import { createNotePdfBuffer, createPdfFileName } from "@/lib/pdf/note-export";

describe("createNotePdfBuffer", () => {
  it("renders TipTap HTML to a browser-generated text note PDF", async () => {
    const pdf = await createNotePdfBuffer({
      title: "Algebra Review",
      type: "TEXT",
      ownerName: "Ada Lovelace",
      workspaceName: "Math 101",
      updatedAt: new Date("2026-05-08T12:00:00Z"),
      contentJson: {
        type: "tiptap",
        html: "<h1>Quadratics</h1><p><strong>Factor</strong> first.</p>",
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Quadratics" }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Factor", marks: [{ type: "bold" }] },
                { type: "text", text: " first, then solve." },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Check both roots" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const source = pdf.toString("utf8");
    expect(source.startsWith("%PDF-")).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});

describe("createPdfFileName", () => {
  it("creates a safe pdf filename", () => {
    expect(createPdfFileName("Unit 1 / Algebra?")).toBe("Unit 1 - Algebra.pdf");
  });
});
