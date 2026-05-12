"use client";

import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine,
  Bold, Code, Code2, Highlighter, Image as ImageIcon,
  Italic, Link as LinkIcon, List, ListChecks, ListIndentDecrease,
  ListIndentIncrease, ListOrdered,
  Minus, Quote, Redo2, Strikethrough, Subscript, Superscript,
  Table as TableIcon, TableCellsMerge, TableCellsSplit,
  Trash2, Underline as UnderlineIcon, Undo2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

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

// 12 text colors, 4 per row
const TEXT_COLORS = [
  "#20201d", "#4d4f47", "#9a9c92", "#ffffff",
  "#c0392b", "#e67e22", "#f1c40f", "#27ae60",
  "#2980b9", "#8e44ad", "#2f604b", "#e91e8c",
];

// 8 highlight colors, 4 per row
const HIGHLIGHT_COLORS = [
  "#fff176", "#a5d6a7", "#90caf9", "#ef9a9a",
  "#ce93d8", "#ffcc80", "#80cbc4", "#f48fb1",
];

// Cell background color palette (None + 7 soft tints)
const CELL_BG_COLORS = [
  { label: "None",   value: "" },
  { label: "Gray",   value: "#f5f5f0" },
  { label: "Green",  value: "#e8f5e9" },
  { label: "Blue",   value: "#e3f2fd" },
  { label: "Yellow", value: "#fffde7" },
  { label: "Red",    value: "#fce4ec" },
  { label: "Purple", value: "#f3e5f5" },
  { label: "Orange", value: "#fff3e0" },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function ColorPicker({
  colors,
  activeColor,
  onSelect,
  onClear,
  label,
}: {
  colors: string[];
  activeColor?: string;
  onSelect: (color: string) => void;
  onClear: () => void;
  label: string;
}) {
  return (
    <div
      className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-[#d8d8ce] bg-white p-3 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9a9c92]">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={(e) => { e.preventDefault(); onSelect(color); }}
            className={`size-7 rounded transition hover:scale-110 ${
              activeColor === color
                ? "ring-2 ring-[#2f604b] ring-offset-1"
                : "border border-[#d8d8ce]"
            }`}
            style={{ background: color }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClear(); }}
        className="mt-2.5 w-full rounded-md border border-[#d8d8ce] bg-[#f7f7f2] py-1.5 text-xs font-medium text-[#4d4f47] hover:bg-[#efefea]"
      >
        Clear
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function NoteToolbar({ editor }: { editor: Editor }) {
  const [showTextColors, setShowTextColors] = useState(false);
  const [showHighlightColors, setShowHighlightColors] = useState(false);
  const [showCellColors, setShowCellColors] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const currentHeading = HEADING_OPTIONS.find((opt) => {
    if (opt.value === 0) return editor.isActive("paragraph");
    return editor.isActive("heading", { level: opt.value });
  }) ?? HEADING_OPTIONS[0];

  const currentFont = FONT_FAMILIES.find(
    (f) => f.value && editor.isActive("textStyle", { fontFamily: f.value }),
  ) ?? FONT_FAMILIES[0];

  const currentSize: string = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";

  const insertImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  }, [editor]);

  const insertInlineMath = () => {
    editor.chain().focus().insertContent("$").run();
  };

  const insertDisplayMath = () => {
    editor.chain().focus().insertContent("$$").run();
  };

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    children: React.ReactNode,
  ) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1 transition ${
        active
          ? "bg-[#2f604b] text-white"
          : "text-[#4d4f47] hover:bg-[#efefea] hover:text-[#20201d]"
      }`}
    >
      {children}
    </button>
  );

  const sep = () => <div className="mx-0.5 h-5 w-px bg-[#d8d8ce]" />;
  const tsep = () => <div className="mx-1 h-5 w-px bg-[#d8d8ce]" />;

  const selectCls = "h-7 rounded border border-[#d8d8ce] bg-white px-1.5 text-xs text-[#4d4f47] outline-none focus:border-[#2f604b]";

  const activeColor = editor.getAttributes("textStyle").color as string | undefined;
  const activeHighlight = editor.getAttributes("highlight").color as string | undefined;

  const inTable = editor.isActive("table");

  return (
    <div className="rounded-t-md border border-b-0 border-[#d8d8ce] bg-[#f7f7f2]">

      {/* ── Main toolbar row ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">

        {/* History */}
        {btn(false, "Undo (⌘Z)",    () => editor.chain().focus().undo().run(), <Undo2 size={14} />)}
        {btn(false, "Redo (⌘⇧Z)",  () => editor.chain().focus().redo().run(), <Redo2 size={14} />)}
        {sep()}

        {/* Block type */}
        <select
          title="Block type"
          value={currentHeading.value}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (val === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().setHeading({ level: val as 1 | 2 | 3 | 4 | 5 | 6 }).run();
          }}
          className={`${selectCls} w-28`}
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
          className={`${selectCls} w-28`}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font size — shows current active size */}
        <select
          title="Font size"
          value={currentSize}
          onChange={(e) => {
            if (!e.target.value) editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(e.target.value).run();
          }}
          className={`${selectCls} w-16`}
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s.replace("px", "")}</option>
          ))}
        </select>

        {sep()}

        {/* Inline formatting */}
        {btn(editor.isActive("bold"),        "Bold (⌘B)",     () => editor.chain().focus().toggleBold().run(),        <Bold size={14} />)}
        {btn(editor.isActive("italic"),      "Italic (⌘I)",   () => editor.chain().focus().toggleItalic().run(),      <Italic size={14} />)}
        {btn(editor.isActive("underline"),   "Underline (⌘U)",() => editor.chain().focus().toggleUnderline().run(),   <UnderlineIcon size={14} />)}
        {btn(editor.isActive("strike"),      "Strikethrough", () => editor.chain().focus().toggleStrike().run(),      <Strikethrough size={14} />)}
        {btn(editor.isActive("code"),        "Inline code",   () => editor.chain().focus().toggleCode().run(),        <Code size={14} />)}
        {btn(editor.isActive("subscript"),   "Subscript",     () => editor.chain().focus().toggleSubscript().run(),   <Subscript size={14} />)}
        {btn(editor.isActive("superscript"), "Superscript",   () => editor.chain().focus().toggleSuperscript().run(), <Superscript size={14} />)}

        {/* Math */}
        {btn(false, "Inline math — type $…$ or click to insert",
          insertInlineMath,
          <span className="font-mono text-[11px] font-semibold leading-none tracking-tight">$$</span>,
        )}
        {btn(false, "Display math — type $$…$$ or click to insert",
          insertDisplayMath,
          <span className="font-mono text-[11px] font-semibold leading-none tracking-tight">$$</span>,
        )}

        {sep()}

        {/* Text color */}
        <div className="relative">
          <button
            type="button"
            title="Text color"
            onMouseDown={(e) => { e.preventDefault(); setShowTextColors((v) => !v); setShowHighlightColors(false); setShowCellColors(false); }}
            className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded hover:bg-[#efefea]"
          >
            <span className="text-sm font-bold leading-none" style={{ color: activeColor ?? "#20201d" }}>A</span>
            <span className="h-1 w-5 rounded-sm" style={{ background: activeColor ?? "#20201d" }} />
          </button>
          {showTextColors && (
            <ColorPicker
              label="Text color"
              colors={TEXT_COLORS}
              activeColor={activeColor}
              onSelect={(color) => { editor.chain().focus().setColor(color).run(); setShowTextColors(false); }}
              onClear={() => { editor.chain().focus().unsetColor().run(); setShowTextColors(false); }}
            />
          )}
        </div>

        {/* Highlight color */}
        <div className="relative">
          <button
            type="button"
            title="Highlight color"
            onMouseDown={(e) => { e.preventDefault(); setShowHighlightColors((v) => !v); setShowTextColors(false); setShowCellColors(false); }}
            className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded text-[#4d4f47] hover:bg-[#efefea]"
          >
            <Highlighter size={13} />
            <span className="h-1 w-5 rounded-sm" style={{ background: activeHighlight ?? "#fff176" }} />
          </button>
          {showHighlightColors && (
            <ColorPicker
              label="Highlight color"
              colors={HIGHLIGHT_COLORS}
              activeColor={activeHighlight}
              onSelect={(color) => { editor.chain().focus().toggleHighlight({ color }).run(); setShowHighlightColors(false); }}
              onClear={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightColors(false); }}
            />
          )}
        </div>

        {sep()}

        {/* Alignment */}
        {btn(editor.isActive({ textAlign: "left" }),    "Align left",    () => editor.chain().focus().setTextAlign("left").run(),    <AlignLeft size={14} />)}
        {btn(editor.isActive({ textAlign: "center" }),  "Align center",  () => editor.chain().focus().setTextAlign("center").run(),  <AlignCenter size={14} />)}
        {btn(editor.isActive({ textAlign: "right" }),   "Align right",   () => editor.chain().focus().setTextAlign("right").run(),   <AlignRight size={14} />)}
        {btn(editor.isActive({ textAlign: "justify" }), "Justify",       () => editor.chain().focus().setTextAlign("justify").run(), <AlignJustify size={14} />)}
        {btn(false, "Outdent (⇧Tab)", () => editor.chain().focus().outdent().run(), <ListIndentDecrease size={14} />)}
        {btn(false, "Indent (Tab)",   () => editor.chain().focus().indent().run(),  <ListIndentIncrease size={14} />)}

        {sep()}

        {/* Lists */}
        {btn(editor.isActive("bulletList"),  "Bullet list",  () => editor.chain().focus().toggleBulletList().run(),  <List size={14} />)}
        {btn(editor.isActive("orderedList"), "Ordered list", () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />)}
        {btn(editor.isActive("taskList"),    "Task list",    () => editor.chain().focus().toggleTaskList().run(),    <ListChecks size={14} />)}

        {sep()}

        {/* Block elements */}
        {btn(editor.isActive("blockquote"), "Blockquote", () => editor.chain().focus().toggleBlockquote().run(), <Quote size={14} />)}
        {btn(editor.isActive("codeBlock"),  "Code block",  () => editor.chain().focus().toggleCodeBlock().run(),  <Code2 size={14} />)}

        {sep()}

        {/* Insert table */}
        {btn(false, "Insert table", () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <TableIcon size={14} />)}

        {sep()}

        {/* Link */}
        {btn(editor.isActive("link"), "Insert / remove link", () => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
          } else {
            const url = window.prompt("URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }
        }, <LinkIcon size={14} />)}

        {/* Image */}
        <button
          type="button"
          title="Insert image"
          onMouseDown={(e) => { e.preventDefault(); imageInputRef.current?.click(); }}
          className="flex h-7 min-w-7 items-center justify-center rounded px-1 text-[#4d4f47] transition hover:bg-[#efefea]"
        >
          <ImageIcon size={14} />
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
        {btn(false, "Horizontal rule", () => editor.chain().focus().setHorizontalRule().run(), <Minus size={14} />)}

        {sep()}

        {/* Character count */}
        <span className="ml-auto text-xs text-[#9a9c92]">
          {editor.storage.characterCount?.characters?.() ?? 0} chars
        </span>
      </div>

      {/* ── Table toolbar row (visible only when cursor is inside a table) ── */}
      {inTable && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-[#d8d8ce] px-2 py-1">

          {/* Rows */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9a9c92]">Rows</span>
          {btn(false, "Add row above", () => editor.chain().focus().addRowBefore().run(), <ArrowUpToLine size={13} />)}
          {btn(false, "Add row below", () => editor.chain().focus().addRowAfter().run(),  <ArrowDownToLine size={13} />)}
          {btn(false, "Delete row",    () => editor.chain().focus().deleteRow().run(),
            <span className="flex items-center gap-0.5"><Trash2 size={11} /><span className="text-[10px]">row</span></span>)}

          {tsep()}

          {/* Columns */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9a9c92]">Cols</span>
          {btn(false, "Add column before (left)",  () => editor.chain().focus().addColumnBefore().run(), <ArrowLeftToLine size={13} />)}
          {btn(false, "Add column after (right)",  () => editor.chain().focus().addColumnAfter().run(),  <ArrowRightToLine size={13} />)}
          {btn(false, "Delete column",             () => editor.chain().focus().deleteColumn().run(),
            <span className="flex items-center gap-0.5"><Trash2 size={11} /><span className="text-[10px]">col</span></span>)}

          {tsep()}

          {/* Cells */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9a9c92]">Cells</span>
          {btn(false, "Merge selected cells",  () => editor.chain().focus().mergeCells().run(),  <TableCellsMerge size={13} />)}
          {btn(false, "Split merged cell",     () => editor.chain().focus().splitCell().run(),   <TableCellsSplit size={13} />)}

          {tsep()}

          {/* Design */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9a9c92]">Design</span>
          {btn(
            editor.isActive("tableHeader") || editor.isActive({ isHeader: true }),
            "Toggle header row",
            () => editor.chain().focus().toggleHeaderRow().run(),
            <span className="text-[10px] font-semibold">H row</span>,
          )}
          {btn(
            false,
            "Toggle header column",
            () => editor.chain().focus().toggleHeaderColumn().run(),
            <span className="text-[10px] font-semibold">H col</span>,
          )}

          {/* Cell background color */}
          <div className="relative">
            <button
              type="button"
              title="Cell background color"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowCellColors((v) => !v); }}
              className="flex h-7 items-center gap-1 rounded border border-[#d8d8ce] bg-white px-2 text-[10px] font-medium text-[#4d4f47] hover:bg-[#efefea]"
            >
              <span className="size-3 rounded-sm border border-[#c8c8bd]" style={{ background: "#e8f5e9" }} />
              Cell color
            </button>
            {showCellColors && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-[#d8d8ce] bg-white p-3 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9a9c92]">Cell background</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CELL_BG_COLORS.map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      title={label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        editor.chain().focus().setCellAttribute("backgroundColor", value || null).run();
                        setShowCellColors(false);
                      }}
                      className="flex h-8 flex-col items-center justify-center gap-0.5 rounded border border-[#d8d8ce] transition hover:border-[#2f604b]"
                      style={{ background: value || "#fff" }}
                    >
                      <span className="text-[9px] text-[#4d4f47] drop-shadow-sm">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {tsep()}

          {/* Delete table */}
          {btn(false, "Delete table", () => editor.chain().focus().deleteTable().run(),
            <span className="flex items-center gap-0.5 text-red-600"><Trash2 size={11} /><span className="text-[10px]">table</span></span>)}
        </div>
      )}

    </div>
  );
}
