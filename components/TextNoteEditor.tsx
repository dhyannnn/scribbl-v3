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
import { NoteToolbar } from "@/components/NoteToolbar";
import { noteTitleMaxLength } from "@/lib/note-title";

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

type EditorProps = {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  contentJson: unknown;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
  onExit?: () => void;
};

// Outer shell — waits for Yjs provider to be synced before mounting the editor.
export function TextNoteEditor(props: EditorProps) {
  const room = useRoom();
  const [ySetup, setYSetup] = useState<YSetup | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const provider = getYjsProviderForRoom(room);
      function onSync() {
        if (cancelled) return;
        const yDoc = provider.getYDoc();
        if (yDoc) setYSetup({ provider, yDoc });
      }
      if (provider.synced) onSync();
      else provider.once("sync", onSync);
    } catch {
      // room not ready yet
    }
    return () => { cancelled = true; };
  }, [room]);

  if (!ySetup) {
    return (
      <div className="grid gap-4">
        <TitleInput title={props.title} canEdit={false} onChange={() => {}} />
        <div className="rounded-md border border-[#c8c8bd] bg-white" style={{ minHeight: "360px" }}>
          <p className="p-4 text-sm text-[#9a9c92]">Connecting to live session…</p>
        </div>
      </div>
    );
  }

  return <TextNoteEditorInner {...props} ySetup={ySetup} />;
}

// Inner editor — only mounts once Yjs is confirmed ready.
function TextNoteEditorInner({
  workspaceId, meetingId, noteId, title, contentJson, saveAction, canEdit, onExit, ySetup,
}: EditorProps & { ySetup: YSetup }) {
  const [titleValue, setTitleValue] = useState(title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [flushPendingSave]);

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
          className={`overflow-auto rounded-md border border-[#c8c8bd] bg-white transition focus-within:border-[#2f604b] ${canEdit ? "rounded-t-none border-t-0" : ""}`}
          style={{ minHeight: "360px" }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#777970]">{getStatusText(isPending ? "saving" : saveState)}</p>
        <div className="flex gap-2">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-md border border-[#d8d8ce] bg-white px-4 py-2 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f0f0eb]"
            >
              ← Back to meeting
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={isPending}
              onClick={saveNow}
              className="rounded-md bg-[#2f604b] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
            >
              {isPending ? "Saving…" : "Save Note"}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="rounded-md border border-[#d8d8ce] bg-white p-4 text-sm text-[#66685f]">
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
      <span className="text-sm font-medium text-[#4d4f47]">Title</span>
      <input
        value={title}
        maxLength={noteTitleMaxLength}
        readOnly={!canEdit}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-md border border-[#c8c8bd] bg-white px-4 text-lg font-semibold outline-none transition focus:border-[#2f604b]"
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
