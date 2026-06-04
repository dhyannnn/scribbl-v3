"use client"; // toolbar

import type { Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight,
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine,
  Bold, ChevronDown, ChevronUp, Code, Code2, Highlighter, Image as ImageIcon,
  Italic, Link as LinkIcon, List, ListChecks, ListIndentDecrease,
  ListIndentIncrease, ListOrdered,
  Minus, Printer, Quote, Redo2, Replace, ReplaceAll, Search,
  Strikethrough, Subscript, Superscript,
  Table as TableIcon, TableCellsMerge, TableCellsSplit,
  Trash2, Underline as UnderlineIcon, Undo2, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchAndReplaceStorage } from "@/lib/tiptap/search";
import { createPortal } from "react-dom";

// ── Constants ────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
  { label: "Inter", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
];

const FONT_SIZES = ["8px", "10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px", "48px"];

const LINE_SPACING_OPTIONS = [
  { label: "Normal", value: "" },
  { label: "1.0", value: "1" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "2.0", value: "2" },
  { label: "2.5", value: "2.5" },
];

const LETTER_SPACING_OPTIONS = [
  { label: "Normal", value: "" },
  { label: "-0.05em", value: "-0.05em" },
  { label: "0em", value: "0em" },
  { label: "0.05em", value: "0.05em" },
  { label: "0.1em", value: "0.1em" },
  { label: "0.15em", value: "0.15em" },
  { label: "0.25em", value: "0.25em" },
];

const WORD_SPACING_OPTIONS = [
  { label: "Normal", value: "" },
  { label: "-0.05em", value: "-0.05em" },
  { label: "0em", value: "0em" },
  { label: "0.05em", value: "0.05em" },
  { label: "0.1em", value: "0.1em" },
  { label: "0.2em", value: "0.2em" },
  { label: "0.4em", value: "0.4em" },
];

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
  anchorRef,
}: {
  colors: string[];
  activeColor?: string;
  onSelect: (color: string) => void;
  onClear: () => void;
  label: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos] = useState(() => {
    if (!anchorRef.current) return { top: -9999, left: -9999 };
    const r = anchorRef.current.getBoundingClientRect();
    return { top: r.bottom + 4, left: r.left };
  });

  return createPortal(
    <div
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[9999] w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">{label}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            title={color}
            onMouseDown={(e) => { e.preventDefault(); onSelect(color); }}
            className={`size-7 rounded-full transition hover:scale-110 ${
              activeColor === color
                ? "ring-2 ring-[var(--color-secondary)] ring-offset-1"
                : "border border-[var(--color-border)]"
            }`}
            style={{ background: color }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClear(); }}
        className="mt-2.5 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
      >
        Clear
      </button>
    </div>,
    document.body,
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function NoteToolbar({ editor, flat = false, showSearch, onCloseSearch }: {
  editor: Editor;
  flat?: boolean;
  showSearch?: boolean;
  onCloseSearch?: () => void;
}) {
  const [showTextColors, setShowTextColors] = useState(false);
  const [showHighlightColors, setShowHighlightColors] = useState(false);
  const [showCellColors, setShowCellColors] = useState(false);
  const [showSpacing, setShowSpacing] = useState(false);
  const spacingBtnRef = useRef<HTMLButtonElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showSearch) {
      setSearchTerm("");
      setReplaceTerm("");
      setShowReplace(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.commands as any).setSearchTerm?.("");
    }
  }, [showSearch, editor.commands]);

  useEffect(() => {
    if (!showSpacing) return;
    function handleClickOutside(e: MouseEvent) {
      if (spacingBtnRef.current && !spacingBtnRef.current.contains(e.target as Node)) {
        setShowSpacing(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSpacing]);
  const textColorBtnRef = useRef<HTMLButtonElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);

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
      className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 transition ${
        active
          ? "bg-[var(--color-secondary)] text-white"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
      }`}
    >
      {children}
    </button>
  );

  const sep = () => <div className="mx-0.5 h-5 w-px bg-[var(--color-border)]" />;
  const tsep = () => <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />;

  const selectCls = "h-7 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-secondary)]";

  const activeColor = editor.getAttributes("textStyle").color as string | undefined;
  const activeHighlight = editor.getAttributes("highlight").color as string | undefined;

  const inTable = editor.isActive("table");

  return (
    <div className={`note-toolbar ${flat
      ? "border-b border-[var(--color-border)] bg-[var(--color-surface-low)]"
      : "rounded-t-md border border-b-0 border-[var(--color-border)] bg-[var(--color-surface-low)]"
    }`}>

      {/* ── Main toolbar row ─────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5 sm:flex-wrap">

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

        {/* Font size — − select + */}
        <div className="flex items-center">
          <button
            type="button"
            title="Decrease font size"
            onMouseDown={(e) => {
              e.preventDefault();
              const active = currentSize || "16px";
              const idx = FONT_SIZES.indexOf(active);
              const next = idx > 0 ? FONT_SIZES[idx - 1] : FONT_SIZES[0];
              editor.commands.setFontSize(next!);
            }}
            className="flex h-7 w-5 items-center justify-center rounded-l-full border border-r-0 border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] disabled:opacity-30"
            disabled={!!currentSize && currentSize === FONT_SIZES[0]}
          >
            −
          </button>
          <select
            title="Font size"
            value={currentSize || "16px"}
            onChange={(e) => {
              editor.chain().focus().setFontSize(e.target.value).run();
            }}
            className="h-7 border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-xs text-[var(--color-muted)] outline-none focus:border-[var(--color-secondary)]"
            style={{ width: "3.2rem" }}
          >
            {FONT_SIZES.map((s) => (
              <option key={s} value={s}>{s.replace("px", "")}</option>
            ))}
          </select>
          <button
            type="button"
            title="Increase font size"
            onMouseDown={(e) => {
              e.preventDefault();
              const active = currentSize || "16px";
              const idx = FONT_SIZES.indexOf(active);
              const next = idx < FONT_SIZES.length - 1 ? FONT_SIZES[idx + 1] : FONT_SIZES[FONT_SIZES.length - 1];
              editor.commands.setFontSize(next!);
            }}
            className="flex h-7 w-5 items-center justify-center rounded-r-full border border-l-0 border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] disabled:opacity-30"
            disabled={!!currentSize && currentSize === FONT_SIZES[FONT_SIZES.length - 1]}
          >
            +
          </button>
        </div>

        {/* Combined spacing popover */}
        <div>
          <button
            ref={spacingBtnRef}
            type="button"
            title="Text spacing"
            onMouseDown={(e) => {
              e.preventDefault();
              setShowSpacing((v) => !v);
            }}
            className={`${selectCls} flex items-center gap-1 px-2`}
          >
            Spacing <ChevronDown size={11} />
          </button>
          {showSpacing && spacingBtnRef.current && createPortal(
            <div
              style={(() => {
                const r = spacingBtnRef.current!.getBoundingClientRect();
                return { top: r.bottom + 4, left: r.left };
              })()}
              className="fixed z-[9999] w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Spacing</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                  Line
                  <select
                    value={(editor.getAttributes("textStyle").lineHeight as string | undefined) ?? ""}
                    onChange={(e) => {
                      if (!e.target.value) editor.chain().focus().unsetLineHeight().run();
                      else editor.chain().focus().setLineHeight(e.target.value).run();
                    }}
                    className="h-7 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
                  >
                    {LINE_SPACING_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                  Letter
                  <select
                    value={(editor.getAttributes("textStyle").letterSpacing as string | undefined) ?? ""}
                    onChange={(e) => {
                      if (!e.target.value) editor.chain().focus().unsetLetterSpacing().run();
                      else editor.chain().focus().setLetterSpacing(e.target.value).run();
                    }}
                    className="h-7 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
                  >
                    {LETTER_SPACING_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                  Word
                  <select
                    value={(editor.getAttributes("textStyle").wordSpacing as string | undefined) ?? ""}
                    onChange={(e) => {
                      if (!e.target.value) editor.chain().focus().unsetWordSpacing().run();
                      else editor.chain().focus().setWordSpacing(e.target.value).run();
                    }}
                    className="h-7 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
                  >
                    {WORD_SPACING_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>,
            document.body,
          )}
        </div>

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
        <div>
          <button
            ref={textColorBtnRef}
            type="button"
            title="Text color"
            onMouseDown={(e) => { e.preventDefault(); setShowTextColors((v) => !v); setShowHighlightColors(false); setShowCellColors(false); }}
            className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded-full hover:bg-[var(--color-surface-mid)]"
          >
            <span className="text-sm font-bold leading-none" style={{ color: activeColor ?? "var(--color-text)" }}>A</span>
            <span className="h-1 w-5 rounded-sm" style={{ background: activeColor ?? "var(--color-text)" }} />
          </button>
          {showTextColors && (
            <ColorPicker
              label="Text color"
              colors={TEXT_COLORS}
              activeColor={activeColor}
              anchorRef={textColorBtnRef}
              onSelect={(color) => { editor.chain().focus().setColor(color).run(); setShowTextColors(false); }}
              onClear={() => { editor.chain().focus().unsetColor().run(); setShowTextColors(false); }}
            />
          )}
        </div>

        {/* Highlight color */}
        <div>
          <button
            ref={highlightBtnRef}
            type="button"
            title="Highlight color"
            onMouseDown={(e) => { e.preventDefault(); setShowHighlightColors((v) => !v); setShowTextColors(false); setShowCellColors(false); }}
            className="flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
          >
            <Highlighter size={13} />
            <span className="h-1 w-5 rounded-sm" style={{ background: activeHighlight ?? "#fff176" }} />
          </button>
          {showHighlightColors && (
            <ColorPicker
              label="Highlight color"
              colors={HIGHLIGHT_COLORS}
              activeColor={activeHighlight}
              anchorRef={highlightBtnRef}
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
        {btn(editor.isActive("link"), "Insert / remove link (⌘⇧K)", () => {
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
          className="flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
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

        {/* Print */}
        {btn(false, "Print (⌘P)", () => window.print(), <Printer size={14} />)}

        {/* Character count */}
        <span className="ml-auto font-mono text-xs text-[var(--color-subtle)]">
          {editor.storage.characterCount?.characters?.() ?? 0} chars
        </span>
      </div>

      {/* ── Table toolbar row (visible only when cursor is inside a table) ── */}
      {inTable && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-t border-[var(--color-border)] px-2 py-1 sm:flex-wrap">

          {/* Rows */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Rows</span>
          {btn(false, "Add row above", () => editor.chain().focus().addRowBefore().run(), <ArrowUpToLine size={13} />)}
          {btn(false, "Add row below", () => editor.chain().focus().addRowAfter().run(),  <ArrowDownToLine size={13} />)}
          {btn(false, "Delete row",    () => editor.chain().focus().deleteRow().run(),
            <span className="flex items-center gap-0.5"><Trash2 size={11} /><span className="text-[10px]">row</span></span>)}

          {tsep()}

          {/* Columns */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Cols</span>
          {btn(false, "Add column before (left)",  () => editor.chain().focus().addColumnBefore().run(), <ArrowLeftToLine size={13} />)}
          {btn(false, "Add column after (right)",  () => editor.chain().focus().addColumnAfter().run(),  <ArrowRightToLine size={13} />)}
          {btn(false, "Delete column",             () => editor.chain().focus().deleteColumn().run(),
            <span className="flex items-center gap-0.5"><Trash2 size={11} /><span className="text-[10px]">col</span></span>)}

          {tsep()}

          {/* Cells */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Cells</span>
          {btn(false, "Merge selected cells",  () => editor.chain().focus().mergeCells().run(),  <TableCellsMerge size={13} />)}
          {btn(false, "Split merged cell",     () => editor.chain().focus().splitCell().run(),   <TableCellsSplit size={13} />)}

          {tsep()}

          {/* Design */}
          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Design</span>
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
              className="flex h-7 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[10px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
            >
              <span className="size-3 rounded-sm border border-[var(--color-border)]" style={{ background: "#e8f5e9" }} />
              Cell color
            </button>
            {showCellColors && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">Cell background</p>
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
                      className="flex h-8 flex-col items-center justify-center gap-0.5 rounded border border-[var(--color-border)] transition hover:border-[var(--color-secondary)]"
                      style={{ background: value || "#fff" }}
                    >
                      <span className="text-[9px] text-[var(--color-muted)] drop-shadow-sm">{label}</span>
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

      {/* ── Find & replace row ───────────────────────────────────── */}
      {showSearch && (
        <div className="flex items-center gap-1 overflow-x-auto border-t border-[var(--color-border)] px-2 py-1.5 sm:flex-wrap">
          <Search size={13} className="shrink-0 text-[var(--color-subtle)]" />
          <input
            type="text"
            value={searchTerm}
            placeholder="Find…"
            autoFocus
            onChange={(e) => {
              setSearchTerm(e.target.value);
              editor.commands.setSearchTerm(e.target.value);
            }}
            className="h-7 w-32 min-w-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
          />
          <span className="min-w-fit text-xs text-[var(--color-subtle)]">
            {(() => {
              const s = (editor.storage as unknown as Record<string, unknown>).searchAndReplace as SearchAndReplaceStorage | undefined;
              const total = s?.results?.length ?? 0;
              if (!total) return "No results";
              return `${(s?.currentIndex ?? 0) + 1} / ${total}`;
            })()}
          </span>
          {btn(false, "Previous match", () => editor.commands.previousSearchResult(), <ChevronUp size={13} />)}
          {btn(false, "Next match", () => editor.commands.nextSearchResult(), <ChevronDown size={13} />)}
          {tsep()}
          {btn(showReplace, "Toggle replace", () => setShowReplace((v) => !v), <Replace size={13} />)}
          {showReplace && (
            <>
              <input
                type="text"
                value={replaceTerm}
                placeholder="Replace…"
                onChange={(e) => {
                  setReplaceTerm(e.target.value);
                  editor.commands.setReplaceTerm(e.target.value);
                }}
                className="h-7 w-32 min-w-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]"
              />
              {btn(false, "Replace current", () => editor.commands.replaceCurrentResult(), <Replace size={13} />)}
              {btn(false, "Replace all", () => editor.commands.replaceAllResults(), <ReplaceAll size={13} />)}
            </>
          )}
          <button
            type="button"
            title="Close search (Esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onCloseSearch?.()}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
          >
            <X size={13} />
          </button>
        </div>
      )}

    </div>
  );
}
