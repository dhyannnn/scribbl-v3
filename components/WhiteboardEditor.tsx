"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useMutation, useMyPresence, useOthers, useStorage } from "@liveblocks/react/suspense";
import { noteTitleMaxLength } from "@/lib/note-title";

export type WhiteboardPoint = {
  x: number;
  y: number;
};

export type WhiteboardStroke = {
  points: WhiteboardPoint[];
};

export type WhiteboardPage = {
  id: string;
  title: string;
  strokes: WhiteboardStroke[];
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type WhiteboardPresence = {
  activeWhiteboardStroke?: {
    pageId: string;
    stroke: WhiteboardStroke;
  } | null;
};

export function WhiteboardEditor({
  workspaceId,
  meetingId,
  noteId,
  title,
  initialStrokes,
  initialPages,
  initialActivePageId,
  saveAction,
  canEdit = true,
}: {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  initialStrokes: WhiteboardStroke[];
  initialPages?: WhiteboardPage[];
  initialActivePageId?: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveIdRef = useRef(0);
  const changeVersionRef = useRef(0);
  const hasPendingSaveRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [titleValue, setTitleValue] = useState(title);
  const fallbackPages = getInitialPages(initialPages, initialStrokes);
  const pages =
    useStorage((root) => {
      const storedPages = getStoredPages(root.whiteboardPages);
      return storedPages.length > 0 ? storedPages : null;
    }) ?? fallbackPages;
  const [localActivePageId, setLocalActivePageId] = useState(
    initialActivePageId ?? fallbackPages[0]?.id ?? "page-1",
  );
  const activePageId = pages.some((page) => page.id === localActivePageId)
    ? localActivePageId
    : pages[0]?.id ?? "page-1";
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0] ?? createWhiteboardPage(1);
  const activePageIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === activePage.id),
  );
  const strokes = activePage.strokes;
  const liveStrokes = useOthers((others) =>
    others
      .map((other) => getPresenceStroke(other.presence, activePage.id))
      .filter(isStroke),
  );
  const [, updateMyPresence] = useMyPresence();
  const [activeStroke, setActiveStroke] = useState<WhiteboardStroke | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const replaceCurrentPageStrokes = useMutation(
    ({ storage }, pageId: string, nextStrokes: WhiteboardStroke[], currentPages: WhiteboardPage[]) => {
      const storedPages = getStoredPages(storage.toJSON().whiteboardPages);
      const editablePages = storedPages.length > 0 ? storedPages : currentPages;
      const nextPages = editablePages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              strokes: nextStrokes,
            }
          : page,
      );

      storage.set("whiteboardPages", nextPages.length > 0 ? nextPages : editablePages);
      storage.set("whiteboardStrokes", nextStrokes);
    },
    [],
  );
  const appendStroke = useMutation(
    ({ storage }, pageId: string, stroke: WhiteboardStroke, currentPages: WhiteboardPage[]) => {
      const storedPages = getStoredPages(storage.toJSON().whiteboardPages);
      const editablePages = storedPages.length > 0 ? storedPages : currentPages;
      let activePageStrokes: WhiteboardStroke[] = [];
      const nextPages = editablePages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }

        activePageStrokes = [...page.strokes, stroke];
        return {
          ...page,
          strokes: activePageStrokes,
        };
      });

      storage.set("whiteboardPages", nextPages);
      storage.set("whiteboardStrokes", activePageStrokes);
    },
    [],
  );
  const addPage = useMutation(
    ({ storage }, currentPages: WhiteboardPage[]) => {
      const storedPages = getStoredPages(storage.toJSON().whiteboardPages);
      const editablePages = storedPages.length > 0 ? storedPages : currentPages;
      const nextPage = createWhiteboardPage(editablePages.length + 1);

      storage.set("whiteboardPages", [...editablePages, nextPage]);
      storage.set("whiteboardStrokes", []);

      return nextPage.id;
    },
    [],
  );

  const flushPendingSave = useCallback(() => {
    if (!canEdit || !formRef.current || !hasPendingSaveRef.current) {
      return;
    }

    hasPendingSaveRef.current = false;
    void Promise.resolve(saveAction(new FormData(formRef.current))).catch(() => {
      hasPendingSaveRef.current = true;
    });
  }, [canEdit, saveAction]);

  useEffect(() => {
    drawCanvas(canvasRef.current, activeStroke ? [...strokes, ...liveStrokes, activeStroke] : [...strokes, ...liveStrokes]);
  }, [activeStroke, liveStrokes, strokes]);

  useEffect(() => {
    function flushBeforeHidden() {
      if (document.visibilityState === "hidden") {
        flushPendingSave();
      }
    }

    document.addEventListener("visibilitychange", flushBeforeHidden);
    window.addEventListener("pagehide", flushPendingSave);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      document.removeEventListener("visibilitychange", flushBeforeHidden);
      window.removeEventListener("pagehide", flushPendingSave);
      updateMyPresence({ activeWhiteboardStroke: null });
      flushPendingSave();
    };
  }, [flushPendingSave, updateMyPresence]);

  function queueAutosave() {
    if (!canEdit) {
      return;
    }

    setSaveState("dirty");
    hasPendingSaveRef.current = true;
    changeVersionRef.current += 1;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveNow();
    }, 900);
  }

  function saveNow() {
    if (!canEdit || !formRef.current) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const saveId = latestSaveIdRef.current + 1;
    const changeVersion = changeVersionRef.current;
    latestSaveIdRef.current = saveId;
    setSaveState("saving");

    const formData = new FormData(formRef.current);

    startTransition(async () => {
      try {
        await saveAction(formData);

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

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  return (
    <div className="mt-5 grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {canEdit ? (
          <label className="grid flex-1 gap-2">
            <span className="text-sm font-medium text-[#4d4f47]">Title</span>
            <input
              name="title"
              form={`${noteId}-whiteboard-form`}
              value={titleValue}
              maxLength={noteTitleMaxLength}
              onChange={(event) => {
                setTitleValue(event.target.value);
                queueAutosave();
              }}
              className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm font-semibold outline-none transition focus:border-[#2f604b] focus:bg-white"
            />
          </label>
        ) : (
          <h3 className="font-semibold">{title}</h3>
        )}
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              replaceCurrentPageStrokes(activePage.id, [], pages);
              queueAutosave();
            }}
            className="rounded-md border border-[#b65b5b] bg-white px-3 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-[#fff7f5]"
          >
            Clear Page
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 rounded-md border border-[#d8d8ce] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={activePageIndex === 0}
            onClick={() => {
              const previousPage = pages[activePageIndex - 1];

              if (previousPage) {
                setActiveStroke(null);
                updateMyPresence({ activeWhiteboardStroke: null });
                setLocalActivePageId(previousPage.id);
              }
            }}
            className="rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <div className="min-w-24 text-center text-sm font-medium text-[#4d4f47]">
            {activePage.title} / {activePageIndex + 1} of {pages.length}
          </div>
          <button
            type="button"
            disabled={activePageIndex >= pages.length - 1}
            onClick={() => {
              const nextPage = pages[activePageIndex + 1];

              if (nextPage) {
                setActiveStroke(null);
                updateMyPresence({ activeWhiteboardStroke: null });
                setLocalActivePageId(nextPage.id);
              }
            }}
            className="rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setActiveStroke(null);
              updateMyPresence({ activeWhiteboardStroke: null });
              const nextPageId = addPage(pages);
              setLocalActivePageId(nextPageId);
              queueAutosave();
            }}
            className="rounded-md bg-[#2f604b] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
          >
            Add Page
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="aspect-[16/9] w-full touch-none rounded-md border border-[#c8c8bd] bg-[#fbfbf8]"
        onPointerDown={(event) => {
          if (!canEdit) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          const nextStroke = { points: [getPoint(event)] };
          setActiveStroke(nextStroke);
          updateMyPresence({ activeWhiteboardStroke: { pageId: activePage.id, stroke: nextStroke } });
        }}
        onPointerMove={(event) => {
          if (!canEdit || !activeStroke) {
            return;
          }

          const nextStroke = {
            points: [...activeStroke.points, getPoint(event)],
          };
          setActiveStroke(nextStroke);
          updateMyPresence({ activeWhiteboardStroke: { pageId: activePage.id, stroke: nextStroke } });
        }}
        onPointerUp={() => {
          if (!canEdit || !activeStroke) {
            return;
          }

          appendStroke(activePage.id, activeStroke, pages);
          setActiveStroke(null);
          updateMyPresence({ activeWhiteboardStroke: null });
          queueAutosave();
        }}
        onPointerCancel={() => {
          setActiveStroke(null);
          updateMyPresence({ activeWhiteboardStroke: null });
        }}
      />
      {canEdit ? (
        <form
          ref={formRef}
          id={`${noteId}-whiteboard-form`}
          action={saveAction}
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          onSubmit={(event) => {
            event.preventDefault();
            saveNow();
          }}
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {meetingId ? <input type="hidden" name="meetingId" value={meetingId} /> : null}
          <input type="hidden" name="noteId" value={noteId} />
          <input type="hidden" name="strokesJson" value={JSON.stringify(strokes)} />
          <input type="hidden" name="pagesJson" value={JSON.stringify(pages)} />
          <input type="hidden" name="activePageId" value={activePage.id} />
          <p className="text-xs text-[#777970]">{getStatusText(isPending ? "saving" : saveState)}</p>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
          >
            {isPending ? "Saving..." : "Save Board"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-[#777970]">View-only board. Only the owner or collaborative editors can change it.</p>
      )}
    </div>
  );
}

function getStoredPages(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isWhiteboardPage).map((page, index) => ({
    id: page.id,
    title: page.title || `Page ${index + 1}`,
    strokes: page.strokes,
  }));
}

function getInitialPages(initialPages: WhiteboardPage[] | undefined, initialStrokes: WhiteboardStroke[]) {
  const pages = getStoredPages(initialPages);

  if (pages.length > 0) {
    return pages;
  }

  return [
    {
      id: "page-1",
      title: "Page 1",
      strokes: initialStrokes,
    },
  ];
}

function createWhiteboardPage(pageNumber: number): WhiteboardPage {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `page-${Date.now()}`,
    title: `Page ${pageNumber}`,
    strokes: [],
  };
}

function getPresenceStroke(presence: unknown, activePageId: string) {
  if (!presence || typeof presence !== "object" || !("activeWhiteboardStroke" in presence)) {
    return null;
  }

  const liveStroke = (presence as WhiteboardPresence).activeWhiteboardStroke;

  return liveStroke?.pageId === activePageId ? liveStroke.stroke : null;
}

function isStroke(value: unknown): value is WhiteboardStroke {
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

function drawCanvas(canvas: HTMLCanvasElement | null, strokes: WhiteboardStroke[]) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 4;
  context.strokeStyle = "#2f604b";

  for (const stroke of strokes) {
    if (stroke.points.length === 0) {
      continue;
    }

    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (const point of stroke.points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }
}
