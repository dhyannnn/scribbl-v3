"use client";

import { useState } from "react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { createNoteRoomId } from "@/lib/liveblocks-room";
import {
  createMeetingNote,
  requestMeetingPermission,
  saveMeetingNote,
  saveMeetingWhiteboard,
} from "@/app/workspaces/[id]/meetings/[meetingId]/actions";

// ── Serialisable types (safe across the server→client boundary) ───────────────

export type NoteArtifactData = {
  noteId: string;
  noteType: "TEXT" | "WHITEBOARD";
  noteTitle: string;
  noteOwnerUserId: string;
  noteCollaboration: string;
  noteUpdatedAt: string | null; // ISO string — Date is not serialisable
  noteOwnerDisplayName: string | null;
  artifactId: string;
  canEdit: boolean;
  permissionState: "ALLOWED" | "DENIED" | "REQUESTED" | null;
};

export type NoteSlotData = {
  selected: NoteArtifactData | null;
  contentJson: unknown;
  all: NoteArtifactData[];
  disabled: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

type Focused = "shared" | "private" | null;

export function MeetingNotesSection({
  workspaceId,
  meetingId,
  canEditNotes,
  shared,
  priv,
  selectedSharedNoteId,
  selectedPrivateNoteId,
}: {
  workspaceId: string;
  meetingId: string;
  canEditNotes: boolean;
  shared: NoteSlotData;
  priv: NoteSlotData;
  selectedSharedNoteId: string | undefined;
  selectedPrivateNoteId: string | undefined;
}) {
  const [focused, setFocused] = useState<Focused>(null);

  if (focused !== null) {
    const isShared = focused === "shared";
    const slot = isShared ? shared : priv;
    const title = isShared ? "Shared Meeting Notes" : "My Private Notes";
    const badge = isShared ? "Everyone" : "Only you";
    const scope = isShared ? ("SHARED" as const) : ("PRIVATE" as const);
    const selectedId = isShared ? selectedSharedNoteId : selectedPrivateNoteId;
    const preserveName = isShared ? "privateNoteId" : "sharedNoteId";
    const preserveValue = isShared ? selectedPrivateNoteId : selectedSharedNoteId;
    const emptyText = isShared
      ? "Create a shared note or board for everyone in the meeting."
      : "Create private notes while the lesson is happening.";

    return (
      <section id="meeting-notes" className="scroll-mt-6">
        <div className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <NoteHeader
            title={title}
            badge={badge}
            workspaceId={workspaceId}
            meetingId={meetingId}
            scope={scope}
            disabled={!canEditNotes}
            onCollapse={() => setFocused(null)}
          />

          {slot.all.length > 0 ? (
            <NotePickerForm
              workspaceId={workspaceId}
              meetingId={meetingId}
              name={isShared ? "sharedNoteId" : "privateNoteId"}
              selectedId={selectedId ?? ""}
              artifacts={slot.all}
              preserveName={preserveName}
              preserveValue={preserveValue}
            />
          ) : null}

          <NoteEditorSlot
            workspaceId={workspaceId}
            meetingId={meetingId}
            slot={slot}
            emptyText={emptyText}
            canvasHeight="calc(100vh - 320px)"
          />
        </div>
      </section>
    );
  }

  // ── Normal two-column layout ─────────────────────────────────────────────────
  return (
    <section id="meeting-notes" data-split-stack className="scroll-mt-6 grid gap-6 xl:grid-cols-2">
      <NoteCard
        title="Shared Meeting Notes"
        badge="Everyone"
        workspaceId={workspaceId}
        meetingId={meetingId}
        scope="SHARED"
        disabled={!canEditNotes}
        slot={shared}
        selectedId={selectedSharedNoteId}
        preserveName="privateNoteId"
        preserveValue={selectedPrivateNoteId}
        emptyText="Create a shared note or board for everyone in the meeting."
        onExpand={() => setFocused("shared")}
      />
      <NoteCard
        title="My Private Notes"
        badge="Only you"
        workspaceId={workspaceId}
        meetingId={meetingId}
        scope="PRIVATE"
        disabled={!canEditNotes}
        slot={priv}
        selectedId={selectedPrivateNoteId}
        preserveName="sharedNoteId"
        preserveValue={selectedSharedNoteId}
        emptyText="Create private notes while the lesson is happening. They will not appear in shared artifacts."
        onExpand={() => setFocused("private")}
      />
    </section>
  );
}

// ── Note card (normal layout) ─────────────────────────────────────────────────

function NoteCard({
  title,
  badge,
  workspaceId,
  meetingId,
  scope,
  disabled,
  slot,
  selectedId,
  preserveName,
  preserveValue,
  emptyText,
  onExpand,
}: {
  title: string;
  badge: string;
  workspaceId: string;
  meetingId: string;
  scope: "SHARED" | "PRIVATE";
  disabled: boolean;
  slot: NoteSlotData;
  selectedId: string | undefined;
  preserveName: string;
  preserveValue: string | undefined;
  emptyText: string;
  onExpand: () => void;
}) {
  return (
    <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <NoteHeader
        title={title}
        badge={badge}
        workspaceId={workspaceId}
        meetingId={meetingId}
        scope={scope}
        disabled={disabled}
        onExpand={slot.selected ? onExpand : undefined}
      />

      {slot.all.length > 0 ? (
        <NotePickerForm
          workspaceId={workspaceId}
          meetingId={meetingId}
          name={scope === "SHARED" ? "sharedNoteId" : "privateNoteId"}
          selectedId={selectedId ?? ""}
          artifacts={slot.all}
          preserveName={preserveName}
          preserveValue={preserveValue}
        />
      ) : null}

      <NoteEditorSlot
        workspaceId={workspaceId}
        meetingId={meetingId}
        slot={slot}
        emptyText={emptyText}
        canvasHeight={600}
      />
    </section>
  );
}

// ── Note header with create buttons ──────────────────────────────────────────

function NoteHeader({
  title,
  badge,
  workspaceId,
  meetingId,
  scope,
  disabled,
  onExpand,
  onCollapse,
}: {
  title: string;
  badge: string;
  workspaceId: string;
  meetingId: string;
  scope: "SHARED" | "PRIVATE";
  disabled: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="mt-2 inline-flex rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
          {badge}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={createMeetingNote}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="type" value="TEXT" />
          <PendingSubmitButton
            className="rounded-md bg-[#2f604b] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            pendingLabel="Creating..."
          >
            New Note
          </PendingSubmitButton>
        </form>
        <form action={createMeetingNote}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="type" value="WHITEBOARD" />
          <PendingSubmitButton
            className="rounded-md border border-[#2f604b] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            pendingLabel="Creating..."
          >
            New Board
          </PendingSubmitButton>
        </form>
        {onExpand ? (
          <button
            onClick={onExpand}
            className="flex items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2]"
          >
            <ExpandIcon />
            Expand
          </button>
        ) : null}
        {onCollapse ? (
          <button
            onClick={onCollapse}
            className="flex items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2]"
          >
            <CollapseIcon />
            Collapse
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Note picker dropdown ──────────────────────────────────────────────────────

function NotePickerForm({
  workspaceId,
  meetingId,
  name,
  selectedId,
  artifacts,
  preserveName,
  preserveValue,
}: {
  workspaceId: string;
  meetingId: string;
  name: string;
  selectedId: string;
  artifacts: NoteArtifactData[];
  preserveName: string;
  preserveValue: string | undefined;
}) {
  return (
    <form
      action={`/workspaces/${workspaceId}/meetings/${meetingId}#meeting-notes`}
      className="mt-5 grid max-w-full gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto]"
    >
      {preserveValue ? <input type="hidden" name={preserveName} value={preserveValue} /> : null}
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium text-[#4d4f47]">Choose note or board</span>
        <select
          name={name}
          defaultValue={selectedId}
          className="min-h-11 min-w-0 max-w-full rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
        >
          {artifacts.map((a) => (
            <option key={a.noteId} value={a.noteId}>
              {a.noteTitle} / {a.noteType.toLowerCase()}
              {a.noteOwnerDisplayName ? ` / ${a.noteOwnerDisplayName}` : ""}
              {a.noteUpdatedAt
                ? ` / updated ${new Date(a.noteUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="flex min-w-0 items-end">
        <button className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] min-[720px]:w-auto">
          Switch
        </button>
      </div>
    </form>
  );
}

// ── Editor slot — renders the appropriate editor for the selected note ────────

function NoteEditorSlot({
  workspaceId,
  meetingId,
  slot,
  emptyText,
  canvasHeight,
}: {
  workspaceId: string;
  meetingId: string;
  slot: NoteSlotData;
  emptyText: string;
  canvasHeight: number | string;
}) {
  const { selected, contentJson, disabled } = slot;

  if (!selected) {
    return (
      <div className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-5 text-sm leading-6 text-[#66685f]">
        {emptyText}
      </div>
    );
  }

  const canEdit = !disabled && selected.canEdit;
  const roomId = createNoteRoomId(workspaceId, selected.noteId);
  // Only remount the room when the note changes or the meeting ends.
  // Permission changes are handled by editor.setEditable() in TextNoteEditorInner,
  // so including canEdit/permissionState here would tear down Karuna's yDoc
  // instance just as Dhyan gains edit access, breaking cross-user Yjs sync.
  const providerKey = `${roomId}:${disabled ? "locked" : "open"}`;
  const requestAccessForm =
    !canEdit && selected.permissionState !== "REQUESTED" ? (
      <form action={requestMeetingPermission} className="mt-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="meetingId" value={meetingId} />
        <input type="hidden" name="artifactId" value={selected.artifactId} />
        <input
          type="hidden"
          name="targetType"
          value={selected.noteType === "WHITEBOARD" ? "WHITEBOARD" : "SHARED_NOTES"}
        />
        <PendingSubmitButton
          pendingLabel="Requesting..."
          className="rounded-md border border-[#2f604b] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]"
        >
          Request edit access
        </PendingSubmitButton>
      </form>
    ) : null;
  const requestedAccessText =
    !canEdit && selected.permissionState === "REQUESTED" ? (
      <p className="mt-3 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] px-3 py-2 text-sm text-[#66685f]">
        Edit access requested.
      </p>
    ) : null;

  if (selected.noteType === "WHITEBOARD") {
    return (
      <LiveblocksRoom roomId={roomId} providerKey={providerKey}>
        <TldrawWhiteboardEditor
          workspaceId={workspaceId}
          meetingId={meetingId}
          noteId={selected.noteId}
          title={selected.noteTitle}
          initialSnapshot={getTldrawSnapshot(contentJson)}
          saveAction={saveMeetingWhiteboard}
          canEdit={canEdit}
          canvasHeight={canvasHeight}
        />
        {requestAccessForm}
        {requestedAccessText}
      </LiveblocksRoom>
    );
  }

  return (
    <LiveblocksRoom roomId={roomId} providerKey={providerKey}>
      <TextNoteEditor
        workspaceId={workspaceId}
        meetingId={meetingId}
        noteId={selected.noteId}
        title={selected.noteTitle}
        contentJson={contentJson}
        saveAction={saveMeetingNote}
        canEdit={canEdit}
      />
      {requestAccessForm}
      {requestedAccessText}
    </LiveblocksRoom>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTldrawSnapshot(contentJson: unknown) {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  return c?.type === "tldraw" ? c.snapshot : null;
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
