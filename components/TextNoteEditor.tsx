"use client";

import "katex/dist/katex.min.css";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { useOthers, useRoom, useUpdateMyPresence } from "@liveblocks/react/suspense";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeaderBase from "@tiptap/extension-table-header";
import TableCellBase from "@tiptap/extension-table-cell";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { InlineMathNode } from "@aarkue/tiptap-math-extension";
import { FontSize } from "@/lib/tiptap/font-size";
import { Indent } from "@/lib/tiptap/indent";
import { KeyboardShortcuts } from "@/lib/tiptap/keyboard-shortcuts";
import { LiveblocksCursors, type CursorUser } from "@/lib/tiptap/liveblocks-cursors";
import { SlashCommands } from "@/lib/tiptap/slash-commands";
import { buildMentionExtension, type MentionMember } from "@/lib/tiptap/mention";
import { NoteToolbar } from "@/components/NoteToolbar";
import { VisibilityDropdown } from "@/components/VisibilityDropdown";
import { noteTitleMaxLength } from "@/lib/note-title";
import { liveblocksNow, logLiveblocksClientTiming } from "@/lib/liveblocks-timing";

// renderText returns " " (1 char) to match the atom's 1 doc-position footprint.
// The default renderText returns the full LaTeX string, which inflates TipTap's
// textBefore calculation and causes "Position out of range" in InputRule handlers
// when a math atom already exists earlier in the same paragraph.
const MathNode = InlineMathNode.extend({
  renderText() { return " "; },
}).configure({ evaluation: false });

function bgCellAttrs() {
  return {
    backgroundColor: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-bgcolor") ?? null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.backgroundColor
          ? { "data-bgcolor": attrs.backgroundColor, style: `background-color:${attrs.backgroundColor}` }
          : {},
    },
  };
}
const TableCell = TableCellBase.extend({ addAttributes() { return { ...this.parent?.(), ...bgCellAttrs() }; } });
const TableHeader = TableHeaderBase.extend({ addAttributes() { return { ...this.parent?.(), ...bgCellAttrs() }; } });

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

type YSetup = {
  provider: ReturnType<typeof getYjsProviderForRoom>;
  yDoc: ReturnType<ReturnType<typeof getYjsProviderForRoom>["getYDoc"]>;
};


function tiptapInitialContent(contentJson: unknown): object | null {
  const c = contentJson as Record<string, unknown> | null;
  if (c?.type === "tiptap" && c.content) return c.content as object;
  if (typeof c?.text === "string" && c.text) {
    return {
      type: "doc",
      content: c.text.split(/\r?\n/).map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
    };
  }
  return null;
}

const PAGE_HEIGHT = 1056; // US Letter at 96 dpi
const ZOOM_LEVELS = [50, 75, 90, 100, 110, 125, 150, 200] as const;

type EditorProps = {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  contentJson: unknown;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
  canExportPdf?: boolean;
  noteVisibility?: string;
  canChangeVisibility?: boolean;
  onExit?: () => void;
  onCollapse?: () => void;
  variant?: "card" | "document";
  members?: MentionMember[];
};

function CollapseDocIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M13 5H9V1M1 9h4v4M9 1l-5 5M5 13l5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Outer shell — waits for Yjs provider to be synced before mounting the editor.
export function TextNoteEditor(props: EditorProps) {
  const room = useRoom();
  const [ySetup, setYSetup] = useState<YSetup | null>(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = liveblocksNow();
    try {
      const provider = getYjsProviderForRoom(room);
      function onSync() {
        if (cancelled) return;
        const yDoc = provider.getYDoc();
        if (yDoc) {
          logLiveblocksClientTiming("Text note Yjs sync", {
            room: room.id,
            noteId: props.noteId,
            alreadySynced: provider.synced,
          }, liveblocksNow() - startedAt);
          setYSetup({ provider, yDoc });
        }
      }
      if (provider.synced) onSync();
      else provider.once("sync", onSync);
    } catch {
      // room not ready yet
    }
    return () => { cancelled = true; };
  }, [props.noteId, room]);

  if (!ySetup) {
    if (props.variant === "document") {
      return (
        <div className="scribbl-document-editor flex h-full min-h-0 flex-col">
          <div className="flex h-12 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
            <span className="text-base font-semibold text-[var(--color-text)]">{props.title}</span>
          </div>
          <div className="min-h-0 flex-1 bg-[var(--color-surface-low)]">
            <p className="p-5 text-sm text-[var(--color-subtle)]">Connecting to live session…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="grid gap-4">
        <TitleInput title={props.title} canEdit={false} onChange={() => {}} />
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]" style={{ minHeight: "360px" }}>
          <p className="p-4 text-sm text-[var(--color-subtle)]">Connecting to live session…</p>
        </div>
      </div>
    );
  }

  return <TextNoteEditorInner {...props} ySetup={ySetup} />;
}

// Inner editor — only mounts once Yjs is confirmed ready.
function TextNoteEditorInner({
  workspaceId, meetingId, noteId, title, contentJson, saveAction, canEdit, canExportPdf = true, noteVisibility, canChangeVisibility = false, onExit, onCollapse, variant = "card", members = [], ySetup,
}: EditorProps & { ySetup: YSetup }) {
  const [titleValue, setTitleValue] = useState(title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [linkCopied, setLinkCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const yMeta = useMemo(() => ySetup.yDoc.getMap<string>("note-meta"), [ySetup.yDoc]);

  // Seed title into Yjs on first open if no peer has set it yet
  useEffect(() => {
    if (!yMeta.get("title")) {
      yMeta.set("title", title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yMeta]);

  // Sync remote title changes into local state
  useEffect(() => {
    function onMeta() {
      const remote = yMeta.get("title") ?? "";
      setTitleValue((prev) => (prev !== remote ? remote : prev));
    }
    yMeta.observe(onMeta);
    return () => yMeta.unobserve(onMeta);
  }, [yMeta]);
  const latestSaveIdRef = useRef(0);
  const changeVersionRef = useRef(0);
  const hasPendingSaveRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const updateMyPresence = useUpdateMyPresence();
  const others = useOthers();

  const initialContent = tiptapInitialContent(contentJson);

  const editor = useEditor({
    immediatelyRender: false,
    editable: canEdit,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        undoRedo: false,
      }),
      Collaboration.configure({ document: ySetup.yDoc, field: "tiptap-v1" }),
      LiveblocksCursors,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      FontFamily,
      FontSize,
      Indent,
      KeyboardShortcuts,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start typing your notes…" }),
      CharacterCount,
      Subscript,
      Superscript,
      MathNode,
      ...(canEdit ? [SlashCommands, buildMentionExtension(members)] : []),
    ],
    onCreate: ({ editor: e }) => {
      const yFragment = ySetup.yDoc.getXmlFragment("tiptap-v1");
      function seed() {
        if (yFragment.length === 0 && initialContent) {
          e.commands.setContent(initialContent);
        }
      }
      if (ySetup.provider.synced) seed();
      else ySetup.provider.once("sync", seed);
    },
    onSelectionUpdate: ({ editor: e }) => {
      const { from, to } = e.state.selection;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updateMyPresence as any)({ cursor: { from, to } });
    },
    onUpdate: () => {
      if (canEdit) queueAutosave();
    },
  });

  useEffect(() => {
    (editorRef as React.RefObject<typeof editor>).current = editor;
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [canEdit, editor]);

  // Push other users' cursor positions into the LiveblocksCursors extension
  useEffect(() => {
    if (!editor) return;
    type OtherPresence = { cursor?: { from: number; to: number } | null };
    type OtherInfo = { name?: string; email?: string };
    const users: CursorUser[] = others.map((other) => ({
      id: other.id ?? "unknown",
      name: (other.info as OtherInfo | undefined)?.name
        ?? (other.info as OtherInfo | undefined)?.email
        ?? "Collaborator",
      cursor: (other.presence as OtherPresence | null)?.cursor ?? null,
    }));
    editor.commands.updateLiveblocksUsers(users);
  }, [editor, others]);

  const flushPendingSave = useCallback(() => {
    const e = editorRef.current;
    if (!canEdit || !e || !hasPendingSaveRef.current) return;
    hasPendingSaveRef.current = false;
    const fd = buildFormData(workspaceId, meetingId, noteId, titleValue, e);
    void Promise.resolve(saveAction(fd)).catch(() => { hasPendingSaveRef.current = true; });
  }, [canEdit, meetingId, noteId, saveAction, titleValue, workspaceId]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushPendingSave(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushPendingSave);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  // Page count — ResizeObserver on the ProseMirror element (only active in document variant)
  useEffect(() => {
    if (variant !== "document") return;
    const vp = viewportRef.current;
    if (!vp) return;
    const pm = vp.querySelector(".ProseMirror");
    if (!pm) return;
    const obs = new ResizeObserver(() => {
      setTotalPages(Math.max(1, Math.ceil((pm as HTMLElement).scrollHeight / PAGE_HEIGHT)));
    });
    obs.observe(pm);
    return () => obs.disconnect();
  }, [variant, editor]); // re-run when editor mounts

  // Current page — scroll listener
  useEffect(() => {
    if (variant !== "document") return;
    const vp = viewportRef.current;
    if (!vp) return;
    const onScroll = () => {
      setCurrentPage(Math.max(1, Math.floor(vp.scrollTop / PAGE_HEIGHT) + 1));
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    return () => vp.removeEventListener("scroll", onScroll);
  }, [variant]);

  function handleShare() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function zoomIn() {
    const next = ZOOM_LEVELS.find((z) => z > zoomLevel);
    if (next !== undefined) setZoomLevel(next);
  }

  function zoomOut() {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < zoomLevel);
    if (prev !== undefined) setZoomLevel(prev);
  }

  function queueAutosave() {
    if (!canEdit) return;
    setSaveState("dirty");
    hasPendingSaveRef.current = true;
    changeVersionRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, 900);
  }

  function saveNow() {
    const e = editorRef.current;
    if (!canEdit || !e) return;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    const saveId = latestSaveIdRef.current + 1;
    const changeVersion = changeVersionRef.current;
    latestSaveIdRef.current = saveId;
    setSaveState("saving");
    const fd = buildFormData(workspaceId, meetingId, noteId, titleValue, e);
    startTransition(async () => {
      try {
        await saveAction(fd);
        if (latestSaveIdRef.current === saveId && changeVersionRef.current === changeVersion) {
          hasPendingSaveRef.current = false;
          setSaveState("saved");
        }
      } catch {
        if (latestSaveIdRef.current === saveId && changeVersionRef.current === changeVersion) {
          setSaveState("error");
        }
      }
    });
  }

  const wordCount = editor?.getText().split(/\s+/).filter(Boolean).length ?? 0;
  const charCount = editor?.storage.characterCount?.characters?.() ?? 0;

  const effectiveSaveState = isPending ? "saving" : saveState;

  if (variant === "document") {
    return (
      <div className="scribbl-document-editor flex h-full min-h-0 flex-col">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          <input
            value={titleValue}
            maxLength={noteTitleMaxLength}
            readOnly={!canEdit}
            onChange={(e) => { setTitleValue(e.target.value); yMeta.set("title", e.target.value); queueAutosave(); }}
            placeholder="Untitled"
            className="min-w-0 flex-1 border-0 bg-transparent font-display text-base font-semibold text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtle)]"
          />
          {/* Visibility control */}
          {canChangeVisibility && noteVisibility && (
            <VisibilityDropdown workspaceId={workspaceId} noteId={noteId} current={noteVisibility} />
          )}
          {/* Presence avatars */}
          {others.length > 0 && (
            <div className="flex -space-x-1.5">
              {others.slice(0, 4).map((other) => {
                type OtherInfo = { name?: string; color?: string };
                const info = other.info as OtherInfo | undefined;
                const name = info?.name ?? "?";
                const color = info?.color ?? "#085ac0";
                return (
                  <div
                    key={other.connectionId}
                    title={name}
                    className="flex size-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {name[0]?.toUpperCase()}
                  </div>
                );
              })}
              {others.length > 4 && (
                <div className="flex size-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface-high)] text-[10px] font-bold text-[var(--color-muted)]">
                  +{others.length - 4}
                </div>
              )}
            </div>
          )}
          {/* Export PDF */}
          {canExportPdf && (
            <a
              href={`/api/notes/${noteId}/export`}
              className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              Export PDF
            </a>
          )}
          {/* Share — copy link */}
          <button
            type="button"
            onClick={handleShare}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              linkCopied
                ? "bg-[var(--color-success)] text-white"
                : "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)]"
            }`}
          >
            {linkCopied ? "Copied!" : "Share"}
          </button>
          {/* Collapse (only when launched from NoteEditorShell) */}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse editor"
              className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              <CollapseDocIcon />
            </button>
          )}
        </div>

        {/* Toolbar */}
        {canEdit && editor && <NoteToolbar editor={editor} flat />}

        {/* Scrollable page viewport */}
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-auto bg-[var(--color-surface-low)] py-8"
          style={{ "--scribbl-zoom": String(zoomLevel / 100) } as React.CSSProperties}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Bottom bar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5">
          <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-subtle)]">
            <span className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${
                effectiveSaveState === "saved" || effectiveSaveState === "idle"
                  ? "bg-[var(--color-success)]"
                  : effectiveSaveState === "error"
                  ? "bg-[var(--color-danger)]"
                  : "bg-[var(--color-warning)]"
              }`} />
              {getStatusText(effectiveSaveState)}
            </span>
            <span>{wordCount} words</span>
            <span>{charCount} chars</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--color-subtle)]">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoomLevel <= ZOOM_LEVELS[0]}
                title="Zoom out"
                className="flex size-5 items-center justify-center rounded text-[var(--color-subtle)] hover:bg-[var(--color-surface-mid)] disabled:opacity-30"
              >
                −
              </button>
              <select
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                className="border-0 bg-transparent font-mono text-xs text-[var(--color-subtle)] outline-none"
              >
                {ZOOM_LEVELS.map((z) => (
                  <option key={z} value={z}>{z}%</option>
                ))}
              </select>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                title="Zoom in"
                className="flex size-5 items-center justify-center rounded text-[var(--color-subtle)] hover:bg-[var(--color-surface-mid)] disabled:opacity-30"
              >
                +
              </button>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={saveNow}
                disabled={isPending}
                className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white transition hover:opacity-80 disabled:opacity-40"
              >
                Save Note
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Card variant
  return (
    <div className="grid gap-4">
      <TitleInput
        title={titleValue}
        canEdit={canEdit}
        onChange={(v) => { setTitleValue(v); yMeta.set("title", v); queueAutosave(); }}
      />

      <div className="grid gap-0">
        {canEdit && editor && <NoteToolbar editor={editor} />}
        <div
          className={`overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition focus-within:border-[var(--color-secondary)] ${canEdit ? "rounded-t-none border-t-0" : ""}`}
          style={{ minHeight: "360px" }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--color-subtle)]">{getStatusText(isPending ? "saving" : saveState)}</p>
        <div className="flex gap-2">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              ← Back to meeting
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={isPending}
              onClick={saveNow}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save Note"}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
          This shared note is view-only for you.
        </p>
      )}
    </div>
  );
}

function TitleInput({
  title, canEdit, onChange,
}: { title: string; canEdit: boolean; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-[var(--color-muted)]">Title</span>
      <input
        value={title}
        maxLength={noteTitleMaxLength}
        readOnly={!canEdit}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-lg font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)]"
      />
    </label>
  );
}

function buildFormData(
  workspaceId: string,
  meetingId: string | undefined,
  noteId: string,
  title: string,
  editor: ReturnType<typeof useEditor>,
): FormData {
  const fd = new FormData();
  fd.set("workspaceId", workspaceId);
  if (meetingId) fd.set("meetingId", meetingId);
  fd.set("noteId", noteId);
  fd.set("title", title);
  if (editor) {
    fd.set("contentJson", JSON.stringify({
      type: "tiptap",
      content: editor.getJSON(),
      html: editor.getHTML(),
    }));
  }
  return fd;
}

function getStatusText(saveState: SaveState) {
  switch (saveState) {
    case "dirty":   return "Unsaved changes";
    case "saving":  return "Saving…";
    case "saved":   return "Saved";
    case "error":   return "Could not save. Try again.";
    default:        return "Autosaves while you edit.";
  }
}
