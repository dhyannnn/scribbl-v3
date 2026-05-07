"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";

const FONT_FAMILIES = [
  { label: "Default", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
];

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];

const HEADING_OPTIONS = [
  { label: "Paragraph", value: 0 },
  { label: "Heading 1", value: 1 },
  { label: "Heading 2", value: 2 },
  { label: "Heading 3", value: 3 },
  { label: "Heading 4", value: 4 },
  { label: "Heading 5", value: 5 },
  { label: "Heading 6", value: 6 },
];

const TEXT_COLORS = [
  "#20201d", "#c0392b", "#e67e22", "#f1c40f",
  "#27ae60", "#2980b9", "#8e44ad", "#2f604b",
  "#7f8c8d", "#e74c3c", "#e67e22", "#f39c12",
  "#2ecc71", "#3498db", "#9b59b6", "#1abc9c",
];

const HIGHLIGHT_COLORS = [
  "#fff176", "#a5d6a7", "#90caf9", "#ef9a9a",
  "#ce93d8", "#ffcc80", "#80cbc4", "#f48fb1",
];

export function NoteToolbar({ editor }: { editor: Editor }) {
  const [showTextColors, setShowTextColors] = useState(false);
  const [showHighlightColors, setShowHighlightColors] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentHeading = HEADING_OPTIONS.find((opt) => {
    if (opt.value === 0) return editor.isActive("paragraph");
    return editor.isActive("heading", { level: opt.value });
  }) ?? HEADING_OPTIONS[0];

  const currentFont = FONT_FAMILIES.find((f) => f.value && editor.isActive("textStyle", { fontFamily: f.value })) ?? FONT_FAMILIES[0];

  const insertImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  }, [editor]);

  const btn = (active: boolean, title: string, onClick: () => void, children: React.ReactNode) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm transition ${
        active
          ? "bg-[#2f604b] text-white"
          : "text-[#4d4f47] hover:bg-[#efefea] hover:text-[#20201d]"
      }`}
    >
      {children}
    </button>
  );

  const sep = () => <div className="mx-0.5 h-5 w-px bg-[#d8d8ce]" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 border-[#d8d8ce] bg-[#f7f7f2] px-2 py-1.5">
      {/* History */}
      {btn(false, "Undo", () => editor.chain().focus().undo().run(), "↩")}
      {btn(false, "Redo", () => editor.chain().focus().redo().run(), "↪")}
      {sep()}

      {/* Block type */}
      <select
        title="Block type"
        value={currentHeading.value}
        onChange={(e) => {
          const val = Number(e.target.value);
          if (val === 0) editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: val as 1|2|3|4|5|6 }).run();
        }}
        className="h-7 rounded border border-[#d8d8ce] bg-white px-1.5 text-xs text-[#4d4f47] outline-none focus:border-[#2f604b]"
      >
        {HEADING_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Font family */}
      <select
        title="Font family"
        value={currentFont.value}
        onChange={(e) => {
          if (!e.target.value) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(e.target.value).run();
        }}
        className="h-7 rounded border border-[#d8d8ce] bg-white px-1.5 text-xs text-[#4d4f47] outline-none focus:border-[#2f604b]"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.label} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font size */}
      <select
        title="Font size"
        value=""
        onChange={(e) => {
          if (!e.target.value) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(e.target.value).run();
        }}
        className="h-7 w-20 rounded border border-[#d8d8ce] bg-white px-1.5 text-xs text-[#4d4f47] outline-none focus:border-[#2f604b]"
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s.replace("px", "")}</option>
        ))}
      </select>

      {sep()}

      {/* Inline formatting */}
      {btn(editor.isActive("bold"), "Bold (⌘B)", () => editor.chain().focus().toggleBold().run(), <b>B</b>)}
      {btn(editor.isActive("italic"), "Italic (⌘I)", () => editor.chain().focus().toggleItalic().run(), <i>I</i>)}
      {btn(editor.isActive("underline"), "Underline (⌘U)", () => editor.chain().focus().toggleUnderline().run(), <u>U</u>)}
      {btn(editor.isActive("strike"), "Strikethrough", () => editor.chain().focus().toggleStrike().run(), <s>S</s>)}
      {btn(editor.isActive("code"), "Inline code", () => editor.chain().focus().toggleCode().run(), <span className="font-mono text-xs">{"`"}</span>)}
      {btn(editor.isActive("subscript"), "Subscript", () => editor.chain().focus().toggleSubscript().run(), <span>x<sub>2</sub></span>)}
      {btn(editor.isActive("superscript"), "Superscript", () => editor.chain().focus().toggleSuperscript().run(), <span>x<sup>2</sup></span>)}

      {sep()}

      {/* Text color */}
      <div className="relative">
        <button
          type="button"
          title="Text color"
          onMouseDown={(e) => { e.preventDefault(); setShowTextColors((v) => !v); setShowHighlightColors(false); }}
          className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded text-sm text-[#4d4f47] hover:bg-[#efefea]"
        >
          <span className="font-bold leading-none">A</span>
          <span className="h-1 w-5 rounded-sm" style={{ background: editor.getAttributes("textStyle").color ?? "#20201d" }} />
        </button>
        {showTextColors && (
          <div className="absolute left-0 top-full z-50 mt-1 grid grid-cols-8 gap-1 rounded-md border border-[#d8d8ce] bg-white p-2 shadow-lg">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(color).run(); setShowTextColors(false); }}
                className="size-5 rounded border border-[#d8d8ce] transition hover:scale-110"
                style={{ background: color }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setShowTextColors(false); }}
              className="col-span-8 mt-1 rounded border border-[#d8d8ce] bg-[#f7f7f2] px-2 py-0.5 text-xs text-[#4d4f47] hover:bg-[#efefea]"
            >
              Clear color
            </button>
          </div>
        )}
      </div>

      {/* Highlight color */}
      <div className="relative">
        <button
          type="button"
          title="Highlight"
          onMouseDown={(e) => { e.preventDefault(); setShowHighlightColors((v) => !v); setShowTextColors(false); }}
          className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded text-sm text-[#4d4f47] hover:bg-[#efefea]"
        >
          <span className="text-xs leading-none">✏</span>
          <span className="h-1 w-5 rounded-sm" style={{ background: editor.getAttributes("highlight").color ?? "#fff176" }} />
        </button>
        {showHighlightColors && (
          <div className="absolute left-0 top-full z-50 mt-1 grid grid-cols-4 gap-1 rounded-md border border-[#d8d8ce] bg-white p-2 shadow-lg">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight({ color }).run(); setShowHighlightColors(false); }}
                className="size-5 rounded border border-[#d8d8ce] transition hover:scale-110"
                style={{ background: color }}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); setShowHighlightColors(false); }}
              className="col-span-4 mt-1 rounded border border-[#d8d8ce] bg-[#f7f7f2] px-2 py-0.5 text-xs text-[#4d4f47] hover:bg-[#efefea]"
            >
              Clear highlight
            </button>
          </div>
        )}
      </div>

      {sep()}

      {/* Alignment */}
      {btn(editor.isActive({ textAlign: "left" }), "Align left", () => editor.chain().focus().setTextAlign("left").run(), "⬤◻◻")}
      {btn(editor.isActive({ textAlign: "center" }), "Align center", () => editor.chain().focus().setTextAlign("center").run(), "◻⬤◻")}
      {btn(editor.isActive({ textAlign: "right" }), "Align right", () => editor.chain().focus().setTextAlign("right").run(), "◻◻⬤")}
      {btn(editor.isActive({ textAlign: "justify" }), "Justify", () => editor.chain().focus().setTextAlign("justify").run(), "≡")}

      {sep()}

      {/* Lists */}
      {btn(editor.isActive("bulletList"), "Bullet list", () => editor.chain().focus().toggleBulletList().run(), "•≡")}
      {btn(editor.isActive("orderedList"), "Ordered list", () => editor.chain().focus().toggleOrderedList().run(), "1≡")}
      {btn(editor.isActive("taskList"), "Task list", () => editor.chain().focus().toggleTaskList().run(), "☑")}

      {sep()}

      {/* Block elements */}
      {btn(editor.isActive("blockquote"), "Blockquote", () => editor.chain().focus().toggleBlockquote().run(), <span className="font-serif">&ldquo;&rdquo;</span>)}
      {btn(editor.isActive("codeBlock"), "Code block", () => editor.chain().focus().toggleCodeBlock().run(), <span className="font-mono text-xs">{"{}"}</span>)}

      {sep()}

      {/* Table */}
      {btn(false, "Insert table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), "⊞")}
      {editor.isActive("table") && (
        <>
          {btn(false, "Add column before", () => editor.chain().focus().addColumnBefore().run(), "←|")}
          {btn(false, "Add column after", () => editor.chain().focus().addColumnAfter().run(), "|→")}
          {btn(false, "Delete column", () => editor.chain().focus().deleteColumn().run(), "✕|")}
          {btn(false, "Add row before", () => editor.chain().focus().addRowBefore().run(), "↑—")}
          {btn(false, "Add row after", () => editor.chain().focus().addRowAfter().run(), "—↓")}
          {btn(false, "Delete row", () => editor.chain().focus().deleteRow().run(), "✕—")}
          {btn(false, "Delete table", () => editor.chain().focus().deleteTable().run(), "✕⊞")}
        </>
      )}

      {sep()}

      {/* Link */}
      {btn(editor.isActive("link"), "Toggle link", () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          const url = window.prompt("URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }
      }, "🔗")}

      {/* Image */}
      <button
        type="button"
        title="Insert image"
        onMouseDown={(e) => { e.preventDefault(); imageInputRef.current?.click(); }}
        className="flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm text-[#4d4f47] hover:bg-[#efefea]"
      >
        🖼
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImage(file);
          e.target.value = "";
        }}
      />

      {/* Horizontal rule */}
      {btn(false, "Horizontal rule", () => editor.chain().focus().setHorizontalRule().run(), "—")}

      {sep()}

      {/* Character count */}
      <span className="ml-auto text-xs text-[#9a9c92]">
        {editor.storage.characterCount?.characters?.() ?? 0} chars
      </span>
    </div>
  );
}
