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
import { TimezoneInput } from "@/components/TimezoneInput";
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
  noteType: "TEXT" | "WHITEBOARD" | "MINDBOARD";
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
  canUseSharedWhiteboard = true,
  canExportPdf = true,
  canUploadAssets = true,
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
  canUseSharedWhiteboard?: boolean;
  canExportPdf?: boolean;
  canUploadAssets?: boolean;
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
          "bg-[var(--color-bg)]"
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
          canUseWhiteboard={isShared ? canUseSharedWhiteboard : true}
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
            canExportPdf={canExportPdf}
            canUploadAssets={canUploadAssets}
            lazy={false}
            focusMode={(selectedType === "WHITEBOARD" || selectedType === "MINDBOARD") ? "whiteboard" : "document"}
          />
        </div>
      </section>
    );
  }

  // ── Normal two-column layout ─────────────────────────────────────────────────
  return (
    <section id="meeting-notes" data-split-stack className="scroll-mt-6 grid gap-6 lg:grid-cols-2">
      <NoteCard
        title="Shared Meeting Notes"
        badge="Everyone"
        workspaceId={workspaceId}
        meetingId={meetingId}
        scope="SHARED"
        disabled={!canEditNotes}
        canUseWhiteboard={canUseSharedWhiteboard}
        canExportPdf={canExportPdf}
        canUploadAssets={canUploadAssets}
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
        canUseWhiteboard={true}
        canExportPdf={canExportPdf}
        canUploadAssets={canUploadAssets}
        slot={priv}
        selectedId={selectedPrivateNoteId}
        preserveName="sharedNoteId"
        preserveValue={selectedSharedNoteId}
        emptyText="Create private notes while the meeting is happening. They will not appear in the shared notes and files for this meeting."
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
  canUseWhiteboard,
  canExportPdf = true,
  canUploadAssets = true,
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
  canUseWhiteboard: boolean;
  canExportPdf?: boolean;
  canUploadAssets?: boolean;
  slot: NoteSlotData;
  selectedId: string | undefined;
  preserveName: string;
  preserveValue: string | undefined;
  emptyText: string;
  onExpand: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <NoteHeader
        title={title}
        badge={badge}
        workspaceId={workspaceId}
        meetingId={meetingId}
        scope={scope}
        disabled={disabled}
        canUseWhiteboard={canUseWhiteboard}
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
        canvasHeight="min(600px, 50vh)"
        canExportPdf={canExportPdf}
        canUploadAssets={canUploadAssets}
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
  canUseWhiteboard = true,
  onExpand,
  onCollapse,
}: {
  title: string;
  badge: string;
  workspaceId: string;
  meetingId: string;
  scope: "SHARED" | "PRIVATE";
  disabled: boolean;
  canUseWhiteboard?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">{title}</h2>
        <span className="mt-1.5 inline-flex rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
          {badge}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={createMeetingNote}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="type" value="TEXT" />
          <TimezoneInput />
          <PendingSubmitButton
            className="rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
            disabled={disabled}
            pendingLabel="Creating..."
          >
            New Note
          </PendingSubmitButton>
        </form>
        {canUseWhiteboard ? (
          <>
            <form action={createMeetingNote}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="type" value="WHITEBOARD" />
              <TimezoneInput />
              <PendingSubmitButton
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                disabled={disabled}
                pendingLabel="Creating..."
              >
                New Board
              </PendingSubmitButton>
            </form>
            <form action={createMeetingNote}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="type" value="MINDBOARD" />
              <TimezoneInput />
              <PendingSubmitButton
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                disabled={disabled}
                pendingLabel="Creating..."
              >
                New Mind Board
              </PendingSubmitButton>
            </form>
          </>
        ) : (
          <>
            <a
              href={`/workspaces/${workspaceId}/billing#upgrade`}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
            >
              New Board
              <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
            </a>
            <a
              href={`/workspaces/${workspaceId}/billing#upgrade`}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
            >
              New Mind Board
              <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
            </a>
          </>
        )}
        {onExpand ? (
          <button
            onClick={onExpand}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
          >
            <Maximize2 size={14} />
            Expand
          </button>
        ) : null}
        {onCollapse ? (
          <button
            onClick={onCollapse}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
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
  canUseWhiteboard = true,
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
  canUseWhiteboard?: boolean;
  picker: ReactNode;
  showFloatingVideo: boolean;
  onToggleFloatingVideo: () => void;
  onCollapse: () => void;
}) {
  const isWhiteboard = selected?.noteType === "WHITEBOARD" || selected?.noteType === "MINDBOARD";

  return (
    <header
      className="relative z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6"
    >
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
            aria-hidden="true"
          >
            {isWhiteboard ? <SquarePen size={18} /> : <FileText size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-base font-semibold text-[var(--color-text)] sm:text-lg">
                {selected?.noteTitle ?? title}
              </h2>
              <span className="shrink-0 rounded-full bg-[var(--color-secondary-dim)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
                {badge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-subtle)]">
              {isWhiteboard ? "Focused whiteboard" : "Focused document"} · {title}
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
              <TimezoneInput />
              <PendingSubmitButton
                className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
                disabled={disabled}
                pendingLabel="Creating..."
              >
                <Plus size={13} />
                Note
              </PendingSubmitButton>
            </form>
            {canUseWhiteboard ? (
              <>
                <form action={createMeetingNote}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="meetingId" value={meetingId} />
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="type" value="WHITEBOARD" />
                  <input type="hidden" name="noteFocus" value={scope === "SHARED" ? "shared" : "private"} />
                  <TimezoneInput />
                  <PendingSubmitButton
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
                    disabled={disabled}
                    pendingLabel="Creating..."
                  >
                    <SquarePen size={13} />
                    Board
                  </PendingSubmitButton>
                </form>
                <form action={createMeetingNote}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="meetingId" value={meetingId} />
                  <input type="hidden" name="scope" value={scope} />
                  <input type="hidden" name="type" value="MINDBOARD" />
                  <input type="hidden" name="noteFocus" value={scope === "SHARED" ? "shared" : "private"} />
                  <TimezoneInput />
                  <PendingSubmitButton
                    className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-50"
                    disabled={disabled}
                    pendingLabel="Creating..."
                  >
                    <SquarePen size={13} />
                    Mind Board
                  </PendingSubmitButton>
                </form>
              </>
            ) : (
              <>
                <a
                  href={`/workspaces/${workspaceId}/billing#upgrade`}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  <SquarePen size={13} />
                  Board
                  <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
                </a>
                <a
                  href={`/workspaces/${workspaceId}/billing#upgrade`}
                  className="flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  <SquarePen size={13} />
                  Mind Board
                  <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
                </a>
              </>
            )}
            <button
              onClick={onToggleFloatingVideo}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition ${
                showFloatingVideo
                  ? "border border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
                  : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
              }`}
            >
              {showFloatingVideo ? "Hide video" : "Show video"}
            </button>
            <button
              onClick={onCollapse}
              className="flex min-h-9 items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 text-sm font-semibold text-white transition hover:opacity-80"
            >
              <Minimize2 size={13} />
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
    <div className="relative z-10 border-b border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-warning)]">
            {pendingRequests.length} edit access {pendingRequests.length === 1 ? "request" : "requests"} pending
          </p>
          <p className="mt-1 text-xs text-[var(--color-warning)]">
            Review requests without leaving focused mode.
          </p>
        </div>
        <div className="grid min-w-0 gap-2 lg:min-w-[420px]">
          {pendingRequests.map((request) => (
            <div
              key={`${request.userId}:${request.targetType}:${request.artifactId ?? "meeting"}`}
              className="grid min-w-0 gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--color-text)]">{request.user.displayName}</p>
                <p className="truncate text-xs text-[var(--color-subtle)]">
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
        <span className={`${compact ? "sr-only" : "text-xs font-medium text-[var(--color-muted)]"}`}>Choose note or board</span>
        <select
          name={name}
          defaultValue={selectedId}
          className="min-h-10 min-w-0 max-w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
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
        <button className="min-h-10 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] min-[720px]:w-auto">
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
  canExportPdf = true,
  canUploadAssets = true,
  lazy = false,
  focusMode,
}: {
  workspaceId: string;
  meetingId: string;
  slot: NoteSlotData;
  emptyText: string;
  canvasHeight: number | string;
  canExportPdf?: boolean;
  canUploadAssets?: boolean;
  lazy?: boolean;
  focusMode?: "document" | "whiteboard";
}) {
  const { selected, contentJson, disabled } = slot;

  if (!selected) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] p-5 text-sm leading-6 text-[var(--color-subtle)]">
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

  if (selected.noteType === "WHITEBOARD" || selected.noteType === "MINDBOARD") {
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
            canExportPdf={canExportPdf}
            canUploadAssets={canUploadAssets}
            canvasHeight={canvasHeight}
            variant={focusMode === "whiteboard" ? "goodnotes" : "card"}
            isMindboard={selected.noteType === "MINDBOARD"}
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
  const targetType = (selected.noteType === "WHITEBOARD" || selected.noteType === "MINDBOARD") ? "WHITEBOARD" : "SHARED_NOTES";
  const className =
    focusMode === "document"
      ? "mx-auto mt-4 w-full max-w-[816px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-3"
      : focusMode === "whiteboard"
        ? "mx-4 mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:mx-6"
        : "mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-3";

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--color-muted)]">
          You can view this {(selected.noteType === "WHITEBOARD" || selected.noteType === "MINDBOARD") ? "board" : "note"}. Request edit access from the meeting owner.
        </p>
        {isRequested ? (
          <p className="shrink-0 text-sm font-medium text-[var(--color-warning)]">Edit access requested.</p>
        ) : (
          <form action={requestMeetingPermission} className="shrink-0">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="meetingId" value={meetingId} />
            <input type="hidden" name="artifactId" value={selected.artifactId} />
            <input type="hidden" name="targetType" value={targetType} />
            <PendingSubmitButton
              pendingLabel="Requesting..."
              className="min-h-9 rounded-full border border-[var(--color-secondary)] bg-[var(--color-surface)] px-3 text-sm font-medium text-[var(--color-secondary)] transition hover:bg-[var(--color-secondary-dim)]"
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
    <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]" style={{ minHeight: "360px" }}>
      <p className="p-4 text-sm text-[var(--color-subtle)]">Connecting to live session...</p>
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
  const base = "min-h-9 rounded-full px-3 text-xs font-semibold transition disabled:opacity-50";

  if (variant === "danger") {
    return `${base} border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-danger)] hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]`;
  }

  return `${base} bg-[var(--color-primary)] text-white hover:opacity-80`;
}
