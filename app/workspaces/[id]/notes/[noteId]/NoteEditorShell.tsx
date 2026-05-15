"use client";

import { useEffect, useState } from "react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { createNoteRoomId } from "@/lib/liveblocks-room";
import { saveTextNote, saveWhiteboardNote } from "../actions";

type Props = {
  workspaceId: string;
  noteId: string;
  noteType: "TEXT" | "WHITEBOARD";
  title: string;
  contentJson: unknown;
  canEdit: boolean;
  canExport: boolean;
  tldrawSnapshot: unknown;
};

export function NoteEditorShell({
  workspaceId,
  noteId,
  noteType,
  title,
  contentJson,
  canEdit,
  canExport,
  tldrawSnapshot,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const roomId = createNoteRoomId(workspaceId, noteId);

  // Escape key collapses the expanded view
  useEffect(() => {
    if (!expanded) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expanded]);

  // Lock body scroll while expanded
  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [expanded]);

  if (expanded) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f7f2]">
        {/* Minimal header bar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#d8d8ce] bg-white px-4 py-3 sm:px-6">
          <p className="min-w-0 flex-1 truncate font-semibold text-[#20201d]">{title}</p>
          {canExport && noteType === "TEXT" ? (
            <a
              href={`/api/notes/${noteId}/export`}
              className="shrink-0 rounded-md bg-[#2f604b] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
            >
              Export PDF
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2]"
          >
            <CollapseIcon />
            Collapse
          </button>
        </div>

        {/* Editor — fills remaining height */}
        <div className="min-h-0 flex-1 overflow-auto">
          <LiveblocksRoom roomId={roomId}>
            {noteType === "TEXT" ? (
              <TextNoteEditor
                workspaceId={workspaceId}
                noteId={noteId}
                title={title}
                contentJson={contentJson}
                saveAction={saveTextNote}
                canEdit={canEdit}
                variant="document"
              />
            ) : (
              <div className="h-full p-4">
                <TldrawWhiteboardEditor
                  workspaceId={workspaceId}
                  noteId={noteId}
                  title={title}
                  initialSnapshot={tldrawSnapshot}
                  saveAction={saveWhiteboardNote}
                  canEdit={canEdit}
                  canvasHeight="calc(100vh - 160px)"
                />
              </div>
            )}
          </LiveblocksRoom>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Expand button — sits above the editor */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#4d4f47] shadow-sm transition hover:bg-[#f7f7f2]"
        >
          <ExpandIcon />
          Expand
        </button>
      </div>

      {/* Normal editor */}
      <LiveblocksRoom roomId={roomId}>
        {noteType === "TEXT" ? (
          <TextNoteEditor
            workspaceId={workspaceId}
            noteId={noteId}
            title={title}
            contentJson={contentJson}
            saveAction={saveTextNote}
            canEdit={canEdit}
          />
        ) : (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
            <TldrawWhiteboardEditor
              workspaceId={workspaceId}
              noteId={noteId}
              title={title}
              initialSnapshot={tldrawSnapshot}
              saveAction={saveWhiteboardNote}
              canEdit={canEdit}
            />
          </section>
        )}
      </LiveblocksRoom>
    </>
  );
}

function ExpandIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M9 1h4v4M5 13H1V9M1 1l5 5M13 13l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M13 5H9V1M1 9h4v4M9 1l-5 5M5 13l5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
