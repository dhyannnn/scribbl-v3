"use client";

import { useEffect, useState } from "react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { createNoteRoomId } from "@/lib/liveblocks-room";
import { type MentionMember } from "@/lib/tiptap/mention";
import { saveTextNote, saveWhiteboardNote } from "../actions";

type Props = {
  workspaceId: string;
  noteId: string;
  noteType: "TEXT" | "WHITEBOARD";
  title: string;
  contentJson: unknown;
  noteVisibility?: string;
  canEdit: boolean;
  canChangeVisibility?: boolean;
  canExportPdf?: boolean;
  canUploadAssets?: boolean;
  tldrawSnapshot: unknown;
  members?: MentionMember[];
};

export function NoteEditorShell({
  workspaceId,
  noteId,
  noteType,
  title,
  contentJson,
  noteVisibility,
  canEdit,
  canChangeVisibility = false,
  canExportPdf = true,
  canUploadAssets = true,
  tldrawSnapshot,
  members = [],
}: Props) {
  const [expanded, setExpanded] = useState(true);
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
      <div className="fixed inset-0 z-50 flex flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <LiveblocksRoom roomId={roomId}>
            {noteType === "TEXT" ? (
              <TextNoteEditor
                workspaceId={workspaceId}
                noteId={noteId}
                title={title}
                contentJson={contentJson}
                saveAction={saveTextNote}
                canEdit={canEdit}
                canExportPdf={canExportPdf}
                noteVisibility={noteVisibility}
                canChangeVisibility={canChangeVisibility}
                variant="document"
                onCollapse={() => setExpanded(false)}
                members={members}
              />
            ) : (
              <TldrawWhiteboardEditor
                workspaceId={workspaceId}
                noteId={noteId}
                title={title}
                initialSnapshot={tldrawSnapshot}
                saveAction={saveWhiteboardNote}
                canEdit={canEdit}
                canExportPdf={canExportPdf}
                canUploadAssets={canUploadAssets}
                noteVisibility={noteVisibility}
                canChangeVisibility={canChangeVisibility}
                variant="goodnotes"
                onCollapse={() => setExpanded(false)}
              />
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
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] shadow-sm transition hover:bg-[var(--color-surface-mid)]"
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
            members={members}
          />
        ) : (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
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

