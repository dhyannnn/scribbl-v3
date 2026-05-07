"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { getYjsProviderForRoom } from "@liveblocks/yjs";
import { useRoom } from "@liveblocks/react/suspense";
import * as Y from "yjs";
import { noteTitleMaxLength } from "@/lib/note-title";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function TextNoteEditor({
  workspaceId,
  meetingId,
  noteId,
  title,
  text,
  saveAction,
  canEdit,
  rows = 18,
  bodyLabel = "Body",
  placeholder = "Start typing your notes...",
  titleInputClassName = "min-h-12 rounded-md border border-[#c8c8bd] bg-white px-4 text-lg font-semibold outline-none transition focus:border-[#2f604b]",
  textAreaClassName = "resize-y rounded-md border border-[#c8c8bd] bg-white p-4 text-base leading-7 outline-none transition focus:border-[#2f604b]",
  formClassName = "grid gap-5",
  controlsClassName = "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
  readOnlyMessage = "This shared note is view-only for you. Only the owner or collaborative editors can change it.",
}: {
  workspaceId: string;
  meetingId?: string;
  noteId: string;
  title: string;
  text: string;
  saveAction: (formData: FormData) => void | Promise<void>;
  canEdit: boolean;
  rows?: number;
  bodyLabel?: string;
  placeholder?: string;
  titleInputClassName?: string;
  textAreaClassName?: string;
  formClassName?: string;
  controlsClassName?: string;
  readOnlyMessage?: string;
}) {
  const [titleValue, setTitleValue] = useState(title);
  const [textValue, setTextValue] = useState(text);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveIdRef = useRef(0);
  const changeVersionRef = useRef(0);
  const hasPendingSaveRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const room = useRoom();
  const yTextRef = useRef<Y.Text | null>(null);
  const isApplyingRemoteChangeRef = useRef(false);

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
      flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    const yProvider = getYjsProviderForRoom(room);
    const yDoc = yProvider.getYDoc();
    const yText = yDoc.getText("text-note-body");
    const yMeta = yDoc.getMap("text-note-meta");
    yTextRef.current = yText;

    function syncFromYText() {
      const nextText = yText.toString();
      isApplyingRemoteChangeRef.current = true;
      setTextValue(nextText);
      isApplyingRemoteChangeRef.current = false;
    }

    function seedText() {
      if (!yMeta.get("seeded") && yText.length === 0 && text) {
        yDoc.transact(() => {
          yMeta.set("seeded", true);
          yText.insert(0, text);
        });
      } else {
        syncFromYText();
      }
    }

    yText.observe(syncFromYText);

    if (yProvider.synced) {
      seedText();
    } else {
      yProvider.once("sync", seedText);
    }

    return () => {
      yText.unobserve(syncFromYText);
      yTextRef.current = null;
    };
  }, [room, text]);

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

  function updateSharedText(nextText: string) {
    const yText = yTextRef.current;

    if (!yText) {
      return;
    }

    const previousText = yText.toString();

    if (previousText === nextText) {
      return;
    }

    const { deleteLength, insertText, startIndex } = getTextDiff(previousText, nextText);

    yText.doc?.transact(() => {
      if (deleteLength > 0) {
        yText.delete(startIndex, deleteLength);
      }

      if (insertText) {
        yText.insert(startIndex, insertText);
      }
    });
  }

  return (
    <form
      ref={formRef}
      action={saveAction}
      className={formClassName}
      onSubmit={(event) => {
        event.preventDefault();
        saveNow();
      }}
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {meetingId ? <input type="hidden" name="meetingId" value={meetingId} /> : null}
      <input type="hidden" name="noteId" value={noteId} />
      <label className="grid gap-2">
        <span className="text-sm font-medium text-[#4d4f47]">Title</span>
        <input
          name="title"
          value={titleValue}
          maxLength={noteTitleMaxLength}
          readOnly={!canEdit}
          onChange={(event) => {
            setTitleValue(event.target.value);
            queueAutosave();
          }}
          className={titleInputClassName}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-[#4d4f47]">{bodyLabel}</span>
        <textarea
          name="text"
          value={textValue}
          rows={rows}
          placeholder={placeholder}
          readOnly={!canEdit}
          onChange={(event) => {
            const nextText = event.target.value;
            setTextValue(nextText);

            if (!isApplyingRemoteChangeRef.current) {
              updateSharedText(nextText);
            }

            queueAutosave();
          }}
          className={textAreaClassName}
        />
      </label>
      {canEdit ? (
        <div className={controlsClassName}>
          <p className="text-xs text-[#777970]">{getStatusText(isPending ? "saving" : saveState)}</p>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-[#2f604b] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
          >
            {isPending ? "Saving..." : "Save Note"}
          </button>
        </div>
      ) : (
        <p className="rounded-md border border-[#d8d8ce] bg-white p-4 text-sm text-[#66685f]">{readOnlyMessage}</p>
      )}
    </form>
  );
}

function getTextDiff(previousText: string, nextText: string) {
  let startIndex = 0;

  while (
    startIndex < previousText.length &&
    startIndex < nextText.length &&
    previousText[startIndex] === nextText[startIndex]
  ) {
    startIndex += 1;
  }

  let previousEnd = previousText.length;
  let nextEnd = nextText.length;

  while (
    previousEnd > startIndex &&
    nextEnd > startIndex &&
    previousText[previousEnd - 1] === nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  return {
    startIndex,
    deleteLength: previousEnd - startIndex,
    insertText: nextText.slice(startIndex, nextEnd),
  };
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
      return "Autosaves while you edit.";
  }
}
