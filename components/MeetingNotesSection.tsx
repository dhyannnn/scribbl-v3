"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Maximize2, Minimize2, Plus, SquarePen } from "lucide-react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { PermissionSubmitButton } from "@/components/PermissionSubmitButton";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { createNoteRoomId } from "@/lib/liveblocks-room";
import {
  createMeetingNote,
  requestMeetingPermission,
  saveMeetingNote,
  saveMeetingWhiteboard,
  setMeetingPermissionOverride,
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

export type PendingMeetingPermissionRequest = {
  userId: string;
  targetType: "SHARED_NOTES" | "WHITEBOARD" | "MICROPHONE" | "CAMERA" | "SCREEN_SHARE";
  artifactId: string | null;
  user: {
    displayName: string;
    email: string;
  };
  artifact: {
    note: {
      title: string;
    } | null;
  } | null;
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
  initialFocused,
  pendingPermissionRequests = [],
}: {
  workspaceId: string;
  meetingId: string;
  canEditNotes: boolean;
  shared: NoteSlotData;
  priv: NoteSlotData;
  selectedSharedNoteId: string | undefined;
  selectedPrivateNoteId: string | undefined;
  initialFocused?: Focused;
  pendingPermissionRequests?: PendingMeetingPermissionRequest[];
}) {
  const [focused, setFocused] = useState<Focused>(initialFocused ?? null);
  const [showFloatingVideo, setShowFloatingVideo] = useState(false);

  useEffect(() => {
    function handleHubNavigation(event: Event) {
      const hash = (event as CustomEvent<{ hash?: string }>).detail?.hash;

      if (!hash) {
        return;
      }

      setFocused(null);
    }

    window.addEventListener("scribbl:meeting-hub-navigate", handleHubNavigation);
    return () => window.removeEventListener("scribbl:meeting-hub-navigate", handleHubNavigation);
  }, []);

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
    const selectedType = slot.selected?.noteType ?? "TEXT";

    return (
      <section
        id="meeting-notes"
        className={`fixed inset-0 scroll-mt-6 flex h-screen flex-col overflow-hidden ${
          showFloatingVideo ? "z-[2147482999]" : "z-[2147483001]"
        } ${
          selectedType === "WHITEBOARD" ? "bg-[#f1f3f6]" : "bg-[#eef1f5]"
        }`}
      >
        <FocusedMeetingNoteChrome
          title={title}
          badge={badge}
          selected={slot.selected}
          workspaceId={workspaceId}
          meetingId={meetingId}
          scope={scope}
          disabled={!canEditNotes}
          picker={
            slot.all.length > 0 ? (
              <NotePickerForm
                workspaceId={workspaceId}
                meetingId={meetingId}
                name={isShared ? "sharedNoteId" : "privateNoteId"}
                selectedId={selectedId ?? ""}
                artifacts={slot.all}
                preserveName={preserveName}
                preserveValue={preserveValue}
                focusValue={focused}
                compact
              />
            ) : null
          }
          showFloatingVideo={showFloatingVideo}
          onToggleFloatingVideo={() => setShowFloatingVideo((value) => !value)}
          onCollapse={() => setFocused(null)}
        />

        <FocusedPermissionRequestsBanner
          workspaceId={workspaceId}
          meetingId={meetingId}
          pendingRequests={pendingPermissionRequests}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <NoteEditorSlot
            workspaceId={workspaceId}
            meetingId={meetingId}
            slot={slot}
            emptyText={emptyText}
            canvasHeight="100%"
            lazy={false}
            focusMode={selectedType === "WHITEBOARD" ? "whiteboard" : "document"}
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
        lazy
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
            <Maximize2 size={14} />
            Expand
          </button>
        ) : null}
        {onCollapse ? (
          <button
            onClick={onCollapse}
            className="flex items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2]"
          >
            <Minimize2 size={14} />
            Collapse
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FocusedMeetingNoteChrome({
  title,
  badge,
  selected,
  workspaceId,
  meetingId,
  scope,
  disabled,
  picker,
  showFloatingVideo,
  onToggleFloatingVideo,
  onCollapse,
}: {
  title: string;
  badge: string;
  selected: NoteArtifactData | null;
  workspaceId: string;
  meetingId: string;
  scope: "SHARED" | "PRIVATE";
  disabled: boolean;
  picker: ReactNode;
  showFloatingVideo: boolean;
  onToggleFloatingVideo: () => void;
  onCollapse: () => void;
}) {
  const isWhiteboard = selected?.noteType === "WHITEBOARD";

  return (
    <header
      className={`relative z-10 border-b border-[#d8d8ce] bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6 ${
        isWhiteboard ? "bg-[#f8fafc]/95" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`grid size-10 shrink-0 place-items-center rounded-md ${
              isWhiteboard ? "bg-[#e6f2ff] text-[#235789]" : "bg-[#e7eee7] text-[#2f604b]"
            }`}
            aria-hidden="true"
          >
            {isWhiteboard ? <SquarePen size={20} /> : <FileText size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-[#20201d] sm:text-lg">
                {selected?.noteTitle ?? title}
              </h2>
              <span className="shrink-0 rounded-md bg-[#e7eee7] px-2.5 py-1 text-xs font-medium text-[#2f604b]">
                {badge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#66685f]">
              {isWhiteboard ? "Focused whiteboard" : "Focused document"} / {title}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          {picker}
          <div className="flex flex-wrap gap-2 lg:flex-nowrap">
            <form action={createMeetingNote}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="type" value="TEXT" />
              <input type="hidden" name="noteFocus" value={scope === "SHARED" ? "shared" : "private"} />
              <PendingSubmitButton
                className="flex min-h-10 items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                pendingLabel="Creating..."
              >
                <Plus size={14} />
                Note
              </PendingSubmitButton>
            </form>
            <form action={createMeetingNote}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="type" value="WHITEBOARD" />
              <input type="hidden" name="noteFocus" value={scope === "SHARED" ? "shared" : "private"} />
              <PendingSubmitButton
                className="flex min-h-10 items-center gap-1.5 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
                pendingLabel="Creating..."
              >
                <SquarePen size={14} />
                Board
              </PendingSubmitButton>
            </form>
            <button
              onClick={onToggleFloatingVideo}
              className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${
                showFloatingVideo
                  ? "border border-[#2f604b] bg-[#eef5ef] text-[#2f604b]"
                  : "border border-[#c8c8bd] bg-white text-[#4d4f47] hover:bg-[#f7f7f2]"
              }`}
            >
              {showFloatingVideo ? "Hide video" : "Show video"}
            </button>
            <button
              onClick={onCollapse}
              className="flex min-h-10 items-center gap-1.5 rounded-md bg-[#20201d] px-3 text-sm font-medium text-white transition hover:bg-[#353530]"
            >
              <Minimize2 size={14} />
              Back to hub
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function FocusedPermissionRequestsBanner({
  workspaceId,
  meetingId,
  pendingRequests,
}: {
  workspaceId: string;
  meetingId: string;
  pendingRequests: PendingMeetingPermissionRequest[];
}) {
  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <div className="relative z-10 border-b border-[#e8e0b5] bg-[#fffceb] px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#7a5a15]">
            {pendingRequests.length} edit access {pendingRequests.length === 1 ? "request" : "requests"} pending
          </p>
          <p className="mt-1 text-xs text-[#806a2f]">
            Review requests without leaving focused mode.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 lg:min-w-[420px]">
          {pendingRequests.map((request) => (
            <div
              key={`${request.userId}:${request.targetType}:${request.artifactId ?? "meeting"}`}
              className="grid min-w-0 gap-2 rounded-md border border-[#e8e0b5] bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#20201d]">{request.user.displayName}</p>
                <p className="truncate text-xs text-[#777970]">
                  {getPermissionTargetLabel(request.targetType)}
                  {request.artifact?.note?.title ? ` - ${request.artifact.note.title}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                <FocusedPermissionOverrideButton
                  workspaceId={workspaceId}
                  meetingId={meetingId}
                  userId={request.userId}
                  targetType={request.targetType}
                  state="ALLOWED"
                  artifactId={request.artifactId ?? undefined}
                  label="Allow"
                  variant="primary"
                />
                <FocusedPermissionOverrideButton
                  workspaceId={workspaceId}
                  meetingId={meetingId}
                  userId={request.userId}
                  targetType={request.targetType}
                  state="DENIED"
                  artifactId={request.artifactId ?? undefined}
                  label="Deny"
                  variant="danger"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FocusedPermissionOverrideButton({
  artifactId,
  label,
  meetingId,
  state,
  targetType,
  userId,
  variant,
  workspaceId,
}: {
  artifactId?: string;
  label: string;
  meetingId: string;
  state: "ALLOWED" | "DENIED";
  targetType: PendingMeetingPermissionRequest["targetType"];
  userId: string;
  variant: "danger" | "primary";
  workspaceId: string;
}) {
  return (
    <form action={setMeetingPermissionOverride}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="state" value={state} />
      {artifactId ? <input type="hidden" name="artifactId" value={artifactId} /> : null}
      <PermissionSubmitButton
        meetingId={meetingId}
        targetType={targetType}
        pendingLabel="Saving..."
        className={getFocusedPermissionButtonClassName(variant)}
      >
        {label}
      </PermissionSubmitButton>
    </form>
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
  focusValue,
  compact = false,
}: {
  workspaceId: string;
  meetingId: string;
  name: string;
  selectedId: string;
  artifacts: NoteArtifactData[];
  preserveName: string;
  preserveValue: string | undefined;
  focusValue?: Focused;
  compact?: boolean;
}) {
  const router = useRouter();

  function switchNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const params = new URLSearchParams();
    const selectedValue = String(data.get(name) ?? "");
    const preservedValue = preserveValue ? String(preserveValue) : "";

    if (selectedValue) {
      params.set(name, selectedValue);
    }

    if (preserveName && preservedValue) {
      params.set(preserveName, preservedValue);
    }

    if (focusValue) {
      params.set("noteFocus", focusValue);
    }

    router.replace(`/workspaces/${workspaceId}/meetings/${meetingId}?${params.toString()}#meeting-notes`, {
      scroll: false,
    });
    router.refresh();
  }

  return (
    <form
      action={`/workspaces/${workspaceId}/meetings/${meetingId}#meeting-notes`}
      onSubmit={switchNote}
      className={`grid max-w-full gap-2 ${
        compact ? "min-w-0 lg:grid-cols-[minmax(220px,360px)_auto]" : "mt-5 min-[720px]:grid-cols-[minmax(0,1fr)_auto]"
      }`}
    >
      {preserveValue ? <input type="hidden" name={preserveName} value={preserveValue} /> : null}
      {focusValue ? <input type="hidden" name="noteFocus" value={focusValue} /> : null}
      <label className="grid min-w-0 gap-2">
        <span className={`${compact ? "sr-only" : "text-sm font-medium text-[#4d4f47]"}`}>Choose note or board</span>
        <select
          name={name}
          defaultValue={selectedId}
          className="min-h-10 min-w-0 max-w-full rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
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
        <button className="min-h-10 w-full rounded-md border border-[#2f604b] bg-white px-4 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] min-[720px]:w-auto">
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
  lazy = false,
  focusMode,
}: {
  workspaceId: string;
  meetingId: string;
  slot: NoteSlotData;
  emptyText: string;
  canvasHeight: number | string;
  lazy?: boolean;
  focusMode?: "document" | "whiteboard";
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
  const accessRequestPanel = !canEdit ? (
    <AccessRequestPanel
      workspaceId={workspaceId}
      meetingId={meetingId}
      selected={selected}
      focusMode={focusMode}
    />
  ) : null;

  if (selected.noteType === "WHITEBOARD") {
    return (
      <>
        {accessRequestPanel}
        <LiveblocksRoom roomId={roomId} providerKey={providerKey} lazy={lazy} fallback={<MeetingNoteConnectingFallback />}>
          <TldrawWhiteboardEditor
            workspaceId={workspaceId}
            meetingId={meetingId}
            noteId={selected.noteId}
            title={selected.noteTitle}
            initialSnapshot={getTldrawSnapshot(contentJson)}
            saveAction={saveMeetingWhiteboard}
            canEdit={canEdit}
            canvasHeight={canvasHeight}
            variant={focusMode === "whiteboard" ? "goodnotes" : "card"}
          />
        </LiveblocksRoom>
      </>
    );
  }

  return (
    <>
      {accessRequestPanel}
      <LiveblocksRoom roomId={roomId} providerKey={providerKey} lazy={lazy} fallback={<MeetingNoteConnectingFallback />}>
        <TextNoteEditor
          workspaceId={workspaceId}
          meetingId={meetingId}
          noteId={selected.noteId}
          title={selected.noteTitle}
          contentJson={contentJson}
          saveAction={saveMeetingNote}
          canEdit={canEdit}
          variant={focusMode === "document" ? "document" : "card"}
        />
      </LiveblocksRoom>
    </>
  );
}

function AccessRequestPanel({
  workspaceId,
  meetingId,
  selected,
  focusMode,
}: {
  workspaceId: string;
  meetingId: string;
  selected: NoteArtifactData;
  focusMode?: "document" | "whiteboard";
}) {
  const isRequested = selected.permissionState === "REQUESTED";
  const targetType = selected.noteType === "WHITEBOARD" ? "WHITEBOARD" : "SHARED_NOTES";
  const className =
    focusMode === "document"
      ? "mx-auto mt-4 w-full max-w-[816px] rounded-md border border-[#d8d8ce] bg-[#fbfbf8] p-3"
      : focusMode === "whiteboard"
        ? "mx-4 mt-4 rounded-md border border-[#d8d8ce] bg-white p-3 shadow-sm sm:mx-6"
        : "mt-4 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] p-3";

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#66685f]">
          You can view this {selected.noteType === "WHITEBOARD" ? "board" : "note"}. Request edit access from the meeting owner.
        </p>
        {isRequested ? (
          <p className="shrink-0 text-sm font-medium text-[#7a5a15]">Edit access requested.</p>
        ) : (
          <form action={requestMeetingPermission} className="shrink-0">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="artifactId" value={selected.artifactId} />
            <input type="hidden" name="targetType" value={targetType} />
            <PendingSubmitButton
              pendingLabel="Requesting..."
              className="min-h-10 rounded-md border border-[#2f604b] bg-white px-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]"
            >
              Request edit access
            </PendingSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

function MeetingNoteConnectingFallback() {
  return (
    <div className="mt-5 rounded-md border border-[#c8c8bd] bg-white" style={{ minHeight: "360px" }}>
      <p className="p-4 text-sm text-[#9a9c92]">Connecting to live session...</p>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTldrawSnapshot(contentJson: unknown) {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  return c?.type === "tldraw" ? c.snapshot : null;
}

function getPermissionTargetLabel(targetType: PendingMeetingPermissionRequest["targetType"]) {
  switch (targetType) {
    case "SHARED_NOTES":
      return "Shared note writing";
    case "WHITEBOARD":
      return "Whiteboard editing";
    case "MICROPHONE":
      return "Microphone";
    case "CAMERA":
      return "Camera";
    case "SCREEN_SHARE":
      return "Screen sharing";
    default:
      return "Meeting permission";
  }
}

function getFocusedPermissionButtonClassName(variant: "danger" | "primary") {
  const base = "min-h-9 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";

  if (variant === "danger") {
    return `${base} border border-[#c97d7d] bg-white text-[#9a3535] hover:bg-[#fff5f5]`;
  }

  return `${base} border border-[#2f604b] bg-[#2f604b] text-white hover:bg-[#244b3a]`;
}
