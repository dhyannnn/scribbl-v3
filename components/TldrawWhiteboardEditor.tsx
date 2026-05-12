"use client";

import "tldraw/tldraw.css";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  DefaultMainMenu,
  EditSubmenu,
  ExtrasGroup,
  PreferencesGroup,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  ViewSubmenu,
  useEditor,
  useExportAs,
  useValue,
  type Editor,
  type TLComponents,
  type TLPageId,
  type TLShapeId,
  type TLUiMainMenuProps,
} from "tldraw";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { useRoom } from "@liveblocks/react/suspense";
import { exportWhiteboardPdf } from "@/lib/tldraw/export-pdf";
import { noteTitleMaxLength } from "@/lib/note-title";
import { useTldrawYjsStore } from "@/components/tldraw-yjs-store";
import {
  COVER_TEMPLATES,
  getPageBackgroundShapeId,
  PAGE_H,
  PAGE_W,
  TEMPLATE_LABELS,
  type PageTemplate,
} from "@/lib/tldraw/page-config";
import {
  PageBackgroundShapeUtil,
  type PageBackgroundShape,
} from "@/lib/tldraw/page-background-shape";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const SHAPE_UTILS = [PageBackgroundShapeUtil];

// Context that passes the current title into the tldraw component tree for export.
const ExportCtx = createContext({ title: "" });

// ── Custom main menu / export submenu — all formats export ALL pages, JSON is removed

function CustomMainMenu(props: TLUiMainMenuProps) {
  return (
    <DefaultMainMenu {...props}>
      <EditSubmenu />
      <ViewSubmenu />
      <CustomExportMenu />
      <ExtrasGroup />
      <PreferencesGroup />
    </DefaultMainMenu>
  );
}

function CustomExportMenu() {
  const editor = useEditor();
  const exportAs = useExportAs();
  const { title } = useContext(ExportCtx);
  const [busySvg, setBusySvg] = useState(false);
  const [busyPng, setBusyPng] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);

  async function handleAllPages(format: "svg" | "png", setBusy: (v: boolean) => void) {
    setBusy(true);
    const pages = editor.getPages();
    const originalPage = editor.getCurrentPageId();
    try {
      for (let i = 0; i < pages.length; i++) {
        editor.setCurrentPage(pages[i].id);
        const ids = [...editor.getCurrentPageShapeIds()];
        const name = pages.length > 1 ? `${title || "whiteboard"} - Page ${i + 1}` : (title || "whiteboard");
        exportAs(ids, format, name);
        // Brief pause between downloads so the browser doesn't block them
        if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      editor.setCurrentPage(originalPage);
      setBusy(false);
    }
  }

  async function handlePdf() {
    setBusyPdf(true);
    try {
      await exportWhiteboardPdf(editor, title || "whiteboard");
    } finally {
      setBusyPdf(false);
    }
  }

  return (
    <TldrawUiMenuSubmenu id="export-all-as" label="context-menu.export-all-as" size="small">
      <TldrawUiMenuGroup id="scribbl-export-all-as-group">
        <TldrawUiMenuItem
          id="scribbl-export-all-as-svg"
          label={busySvg ? "Exporting SVG..." : "SVG"}
          readonlyOk
          disabled={busySvg}
          onSelect={() => handleAllPages("svg", setBusySvg)}
        />
        <TldrawUiMenuItem
          id="scribbl-export-all-as-png"
          label={busyPng ? "Exporting PNG..." : "PNG"}
          readonlyOk
          disabled={busyPng}
          onSelect={() => handleAllPages("png", setBusyPng)}
        />
        <TldrawUiMenuItem
          id="scribbl-export-all-as-pdf"
          label={busyPdf ? "Exporting PDF..." : "PDF"}
          readonlyOk
          disabled={busyPdf}
          onSelect={handlePdf}
        />
      </TldrawUiMenuGroup>
    </TldrawUiMenuSubmenu>
  );
}

const TLDRAW_COMPONENTS = {
  InFrontOfTheCanvas: TemplatePicker,
  MainMenu: CustomMainMenu,
} satisfies TLComponents;

const TldrawCanvas = dynamic(async () => (await import("tldraw")).Tldraw, {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[#777970]">
      Loading whiteboard…
    </div>
  ),
});

// ── Template picker (rendered inside the tldraw canvas via InFrontOfTheCanvas)

function TemplatePicker() {
  const editor = useEditor();
  const [open, setOpen] = useState(false);

  // useValue subscribes to the tldraw store so this re-runs whenever shapes change,
  // including when handleMount creates the background shape after mount.
  const bgShape = useValue(
    "page-bg-shape",
    () =>
      editor
        .getCurrentPageShapes()
        .find((s) => s.type === "page-background") as PageBackgroundShape | undefined,
    [editor],
  );
  const current = (bgShape?.props.template ?? "blank") as PageTemplate;
  const isReadonly = editor.getInstanceState().isReadonly;
  if (isReadonly) return null;

  function apply(t: PageTemplate) {
    if (!bgShape) return;
    // Use store.put directly — editor.updateShape can silently skip locked shapes.
    editor.store.put([{ ...bgShape, props: { ...bgShape.props, template: t } }]);
    setOpen(false);
  }

  const regularTemplates: PageTemplate[] = ["blank", "lined", "dotted", "grid"];

  return (
    <div
      style={{ position: "absolute", bottom: 56, left: 8, zIndex: 500 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && (
        <div className="mb-1 overflow-hidden rounded-lg border border-[#d8d8ce] bg-white shadow-lg">
          <div className="border-b border-[#d8d8ce] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#777970]">
              Template
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {regularTemplates.map((t) => (
                <button
                  key={t}
                  onClick={() => apply(t)}
                  className={`flex flex-col items-center gap-1 rounded-md p-2 text-xs transition hover:bg-[#f0f0eb] ${current === t ? "bg-[#eef5ef] font-semibold text-[#2f604b]" : "text-[#4d4f47]"}`}
                >
                  <TemplateIcon template={t} />
                  {TEMPLATE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#777970]">
              Cover
            </p>
            <div className="mt-2 flex gap-1">
              {COVER_TEMPLATES.map((t) => (
                <button
                  key={t}
                  onClick={() => apply(t)}
                  title={TEMPLATE_LABELS[t]}
                  className={`h-8 w-8 rounded-md transition hover:scale-110 ${current === t ? "ring-2 ring-[#2f604b] ring-offset-1" : ""}`}
                  style={{ background: COVER_BG[t] }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-[#d8d8ce] bg-white px-2.5 py-1.5 text-xs font-medium text-[#4d4f47] shadow-sm transition hover:bg-[#f7f7f2]"
      >
        <TemplateIcon template={current} size={14} />
        {TEMPLATE_LABELS[current]}
      </button>
    </div>
  );
}

const COVER_BG: Record<string, string> = {
  "cover-blue": "#1e40af",
  "cover-green": "#166534",
  "cover-rose": "#9f1239",
  "cover-dark": "#1c1917",
};

function TemplateIcon({ template, size = 16 }: { template: PageTemplate; size?: number }) {
  const s = size;
  const cover = COVER_TEMPLATES.includes(template);
  if (cover) {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill={COVER_BG[template] ?? "#1e40af"} />
      </svg>
    );
  }
  if (template === "lined") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill="white" stroke="#d1d5db" strokeWidth={0.5} />
        {[2.5, 5, 7.5].map((y) => (
          <line key={y} x1={2} y1={y} x2={14} y2={y} stroke="#cbd5e1" strokeWidth={0.8} />
        ))}
      </svg>
    );
  }
  if (template === "dotted") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill="white" stroke="#d1d5db" strokeWidth={0.5} />
        {[3, 7, 11].flatMap((x) =>
          [2.5, 5, 7.5].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} fill="#94a3b8" />
          )),
        )}
      </svg>
    );
  }
  if (template === "grid") {
    return (
      <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
        <rect width={16} height={10} rx={1} fill="white" stroke="#d1d5db" strokeWidth={0.5} />
        {[4, 8, 12].map((x) => (
          <line key={`v${x}`} x1={x} y1={0} x2={x} y2={10} stroke="#cbd5e1" strokeWidth={0.5} />
        ))}
        {[2.5, 5, 7.5].map((y) => (
          <line key={`h${y}`} x1={0} y1={y} x2={16} y2={y} stroke="#cbd5e1" strokeWidth={0.5} />
        ))}
      </svg>
    );
  }
  // blank
  return (
    <svg width={s} height={s * 0.625} viewBox="0 0 16 10" style={{ display: "block" }}>
      <rect width={16} height={10} rx={1} fill="white" stroke="#d1d5db" strokeWidth={0.5} />
    </svg>
  );
}

// ── Main editor component

export function TldrawWhiteboardEditor({
  workspaceId,
  meetingId,
  noteId,
  title,
  initialSnapshot,
  saveAction,
  canEdit = true,
  canvasHeight = 600,
}: {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  initialSnapshot: unknown;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit?: boolean;
  canvasHeight?: number | string;
}) {
  const room = useRoom();
  const storeWithStatus = useTldrawYjsStore({
    shapeUtils: SHAPE_UTILS,
    initialSnapshot,
  });
  const [titleValue, setTitleValue] = useState(title);

  const yMeta = useMemo(
    () => getYjsProviderForRoom(room).getYDoc().getMap<string>("note-meta"),
    [room],
  );

  // Seed title into Yjs on first open if no peer has set it yet (wait for sync)
  useEffect(() => {
    const provider = getYjsProviderForRoom(room);
    function seed() {
      if (!yMeta.get("title")) yMeta.set("title", title);
    }
    if (provider.synced) seed();
    else provider.on("synced", seed);
    return () => provider.off("synced", seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yMeta, room]);

  // Sync remote title changes into local state
  useEffect(() => {
    function onMeta() {
      const remote = yMeta.get("title") ?? "";
      setTitleValue((prev) => (prev !== remote ? remote : prev));
    }
    yMeta.observe(onMeta);
    return () => yMeta.unobserve(onMeta);
  }, [yMeta]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const editorRef = useRef<Editor | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveIdRef = useRef(0);
  const hasPendingSaveRef = useRef(false);
  const titleValueRef = useRef(titleValue);
  // Refs so that the one-time onMount closure always calls the latest versions.
  const canEditRef = useRef(canEdit);
  const queueAutosaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    titleValueRef.current = titleValue;
  }, [titleValue]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const buildFormData = useCallback(() => {
    if (!editorRef.current) return null;
    const snapshot = editorRef.current.store.getStoreSnapshot();
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("noteId", noteId);
    if (meetingId) fd.set("meetingId", meetingId);
    fd.set("title", titleValueRef.current);
    fd.set("snapshotJson", JSON.stringify(snapshot));
    return fd;
  }, [workspaceId, noteId, meetingId]);

  const saveNow = useCallback(() => {
    if (!canEdit) return;
    const fd = buildFormData();
    if (!fd) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const saveId = ++latestSaveIdRef.current;
    setSaveState("saving");
    startTransition(async () => {
      try {
        await saveAction(fd);
        if (latestSaveIdRef.current === saveId) {
          hasPendingSaveRef.current = false;
          setSaveState("saved");
        }
      } catch {
        if (latestSaveIdRef.current === saveId) setSaveState("error");
      }
    });
  }, [canEdit, buildFormData, saveAction]);

  const queueAutosave = useCallback(() => {
    if (!canEdit) return;
    setSaveState("dirty");
    hasPendingSaveRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(saveNow, 900);
  }, [canEdit, saveNow]);

  useEffect(() => {
    queueAutosaveRef.current = queueAutosave;
  }, [queueAutosave]);

  const flushPendingSave = useCallback(() => {
    if (!canEdit || !hasPendingSaveRef.current) return;
    const fd = buildFormData();
    if (!fd) return;
    hasPendingSaveRef.current = false;
    void Promise.resolve(saveAction(fd)).catch(() => {
      hasPendingSaveRef.current = true;
    });
  }, [canEdit, buildFormData, saveAction]);

  useEffect(() => {
    function onHidden() {
      if (document.visibilityState === "hidden") flushPendingSave();
    }
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushPendingSave);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushPendingSave);
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Fixed landscape page — constrain camera to page bounds
      editor.setCameraOptions({
        constraints: {
          bounds: { x: 0, y: 0, w: PAGE_W, h: PAGE_H },
          padding: { x: 64, y: 64 },
          origin: { x: 0.5, y: 0.5 },
          initialZoom: "fit-max",
          baseZoom: "fit-max",
          behavior: "contain",
        },
      });

      // Ensure every page has a locked background shape
      for (const page of editor.getPages()) {
        ensurePageBackground(editor, page.id);
      }

      // Auto-init background when a new page is added
      const unsubPage = editor.sideEffects.registerAfterCreateHandler(
        "page",
        (page) => {
          ensurePageBackground(editor, page.id);
        },
      );

      // Prevent page-background shapes from being deleted
      const unsubDelete = editor.sideEffects.registerBeforeDeleteHandler(
        "shape",
        (shape) => {
          if (shape.type === "page-background") return false;
        },
      );

      // Keep page-background shapes locked
      const unsubChange = editor.sideEffects.registerBeforeChangeHandler(
        "shape",
        (_prev, next) => {
          if (next.type === "page-background" && !next.isLocked) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return { ...next, isLocked: true } as any;
          }
          return next;
        },
      );

      if (!canEditRef.current) {
        editor.updateInstanceState({ isReadonly: true });
      }

      const unsubStore = editor.store.listen(
        () => {
          queueAutosaveRef.current();
        },
        { source: "user", scope: "document" },
      );

      return () => {
        unsubPage();
        unsubDelete();
        unsubChange();
        unsubStore();
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    editorRef.current?.updateInstanceState({ isReadonly: !canEdit });
  }, [canEdit]);

  return (
    <div className="mt-5 grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canEdit ? (
          <label className="grid flex-1 gap-2">
            <span className="text-sm font-medium text-[#4d4f47]">Title</span>
            <input
              value={titleValue}
              maxLength={noteTitleMaxLength}
              onChange={(e) => {
                setTitleValue(e.target.value);
                yMeta.set("title", e.target.value);
                queueAutosave();
              }}
              className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm font-semibold outline-none transition focus:border-[#2f604b] focus:bg-white"
            />
          </label>
        ) : (
          <h3 className="font-semibold">{title}</h3>
        )}
        <p className="text-xs text-[#777970] sm:self-end sm:pb-1">
          {getStatusText(isPending ? "saving" : saveState)}
        </p>
      </div>
      <div
        className="overflow-hidden rounded-md border border-[#c8c8bd] shadow-sm"
        style={{ height: canvasHeight }}
      >
        <ExportCtx.Provider value={{ title: titleValue }}>
          <TldrawCanvas
            store={storeWithStatus}
            shapeUtils={SHAPE_UTILS}
            onMount={handleMount}
            components={TLDRAW_COMPONENTS}
          />
        </ExportCtx.Provider>
      </div>
      {!canEdit && (
        <p className="text-xs text-[#777970]">
          View-only board. Only the owner or collaborative editors can change it.
        </p>
      )}
    </div>
  );
}

function ensurePageBackground(editor: Editor, pageId: TLPageId) {
  if (!editor.getPage(pageId)) return;

  const bgId = getPageBackgroundShapeId(pageId as string) as TLShapeId;
  if (editor.getShape(bgId)) return;

  // createShapeId produces `shape:${string}` — use the pre-built id
  editor.createShape({
    id: bgId,
    parentId: pageId,
    type: "page-background",
    x: 0,
    y: 0,
    isLocked: true,
    props: { w: PAGE_W, h: PAGE_H, template: "blank" },
  });
  editor.sendToBack([bgId]);
}

function getStatusText(saveState: SaveState) {
  switch (saveState) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return "Could not save. Try again.";
    default:
      return "Autosaves after each drawing change.";
  }
}
