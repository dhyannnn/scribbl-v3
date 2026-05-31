import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessRouteRefresher } from "@/components/AccessRouteRefresher";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { updateNoteExportAccess } from "../actions";
import { NoteEditorShell } from "./NoteEditorShell";

type PageProps = {
  params: Promise<{
    id: string;
    noteId: string;
  }>;
};


export default async function NoteEditorPage({ params }: PageProps) {
  const { id, noteId } = await params;

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      workspaceId: id,
      deletedAt: null,
      OR: [
        {
          visibility: "WORKSPACE_SHARED",
        },
        ...(currentUser
          ? [
              {
                visibility: "PRIVATE" as const,
                ownerUserId: currentUser.id,
              },
            ]
          : []),
      ],
    },
    include: {
      workspace: {
        include: {
          members: {
            where: {
              status: "ACTIVE",
            },
            select: {
              userId: true,
              role: true,
              user: {
                select: {
                  displayName: true,
                },
              },
            },
          },
        },
      },
      owner: true,
      artifacts: {
        select: {
          id: true,
          source: true,
          meeting: {
            select: {
              startsAt: true,
              endsAt: true,
              canceledAt: true,
            },
          },
        },
      },
    },
  });

  if (!note || !note.workspace) {
    notFound();
  }

  if (!note.workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const isTextNote = note.type === "TEXT";
  // Shared whiteboards are view-only on Free — private whiteboards are always editable
  const isSharedWhiteboardOnFree =
    !isTextNote &&
    note.visibility === "WORKSPACE_SHARED" &&
    note.workspace?.plan === "FREE";
  const isLockedByMeeting = note.artifacts.some(
    (artifact) =>
      artifact.source === "CREATED_IN_MEETING" &&
      note.visibility === "WORKSPACE_SHARED" &&
      artifact.meeting &&
      !canEditMeetingNotes(getMeetingLifecycle(artifact.meeting)),
  );
  const currentMembership = note.workspace.members.find((member) => member.userId === currentUser.id);
  const canManageWorkspaceNotes = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const canEdit =
    Boolean(currentUser) &&
    !isLockedByMeeting &&
    !isSharedWhiteboardOnFree &&
    (note.ownerUserId === currentUser.id || note.collaboration === "COLLABORATIVE");
  const canChangeVisibility =
    note.visibility === "WORKSPACE_SHARED"
      ? note.ownerUserId === currentUser.id || canManageWorkspaceNotes
      : note.ownerUserId === currentUser.id;
  const canManageExport =
    note.visibility === "WORKSPACE_SHARED" && (note.ownerUserId === currentUser.id || canManageWorkspaceNotes);
  const canExport =
    note.visibility === "PRIVATE"
      ? note.ownerUserId === currentUser.id
      : note.exportAccess === "WORKSPACE_MEMBERS" || canManageExport;
  const tldrawSnapshot = isTextNote ? null : getTldrawSnapshot(note.contentJson);

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <AccessRouteRefresher />
      {isSharedWhiteboardOnFree ? (
        <div className="flex items-center justify-between gap-4 bg-[var(--color-secondary-dim)] px-5 py-3 text-sm text-[var(--color-secondary)]">
          <span>Shared whiteboards are a Pro feature. This board is view-only — upgrade to edit it.</span>
          <Link
            href={`/workspaces/${id}/billing#upgrade`}
            className="shrink-0 rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-6 sm:px-8 lg:px-10">
        {/* Page header */}
        <header className="border-b border-[var(--color-border)] pb-5">
          <Link
            href={`/workspaces/${id}/notes`}
            className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] transition hover:text-[var(--color-text)]"
          >
            ← Back to notes
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                {note.workspace.name} / {note.type.toLowerCase()}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
                {note.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                  {formatEnumLabel(note.visibility, "WORKSPACE_SHARED")}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                  {formatEnumLabel(note.collaboration, "SOLO")}
                </span>
                <span className="text-xs text-[var(--color-subtle)]">by {note.owner.displayName}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              {canExport && isTextNote ? (
                <a
                  href={`/api/notes/${note.id}/export`}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                >
                  Export PDF
                </a>
              ) : null}
            </div>
          </div>
          {isLockedByMeeting ? (
            <p className="mt-4 rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-danger-dim)] px-4 py-3 text-sm text-[var(--color-danger)]">
              This note is attached to a locked meeting and is read-only.
            </p>
          ) : null}
        </header>

        {/* Export Access settings */}
        {canManageExport ? (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Export Access</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Who can export this shared note?</p>
            <form action={updateNoteExportAccess} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="workspaceId" value={id} />
              <input type="hidden" name="noteId" value={note.id} />
              <select
                name="exportAccess"
                defaultValue={note.exportAccess}
                className="min-h-10 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)]"
              >
                <option value="WORKSPACE_MEMBERS">All workspace members</option>
                <option value="OWNER_ADMIN_AND_CREATOR">Owner, admins, and creator</option>
              </select>
              <PendingSubmitButton
                pendingLabel="Saving..."
                className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-80 disabled:opacity-50"
              >
                Save
              </PendingSubmitButton>
            </form>
          </section>
        ) : null}

        <NoteEditorShell
          workspaceId={id}
          noteId={note.id}
          noteType={note.type}
          title={note.title}
          contentJson={note.contentJson}
          noteVisibility={note.visibility}
          canEdit={canEdit}
          canChangeVisibility={canChangeVisibility}
          canExportPdf={note.workspace?.plan !== "FREE"}
          canUploadAssets={note.workspace?.plan !== "FREE"}
          tldrawSnapshot={tldrawSnapshot}
          members={note.workspace.members.map((m) => ({ id: m.userId, name: m.user.displayName }))}
        />
      </div>
    </main>
  );
}

function formatEnumLabel(value: string | null | undefined, fallback: string) {
  return (value ?? fallback).toLowerCase().replaceAll("_", " ");
}

function getExportAccessLabel(visibility: string, exportAccess: string) {
  if (visibility === "PRIVATE") {
    return "Only owner";
  }

  return exportAccess === "WORKSPACE_MEMBERS"
    ? "All workspace members"
    : "Owner, admins, and creator";
}

function getTldrawSnapshot(contentJson: unknown) {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  return c?.type === "tldraw" ? c.snapshot : null;
}
