import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { getGradient } from "@/lib/color-hash";
import { createTextNote, createWhiteboardNote, updateNoteExportAccess } from "./actions";
import { DeleteNoteForm } from "./DeleteNoteForm";
import { TimezoneInput } from "@/components/TimezoneInput";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string }>;
};

export default async function NotesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { note: noteStatus } = await searchParams;

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      members: {
        where: {
          status: "ACTIVE",
        },
        select: {
          userId: true,
          role: true,
        },
      },
      notes: {
        where: {
          deletedAt: null,
          OR: [
            {
              visibility: "WORKSPACE_SHARED",
            },
            {
              visibility: "PRIVATE",
              ownerUserId: currentUser.id,
            },
          ],
        },
        select: {
          id: true,
          title: true,
          type: true,
          visibility: true,
          collaboration: true,
          exportAccess: true,
          ownerUserId: true,
          updatedAt: true,
          owner: {
            select: {
              displayName: true,
            },
          },
          artifacts: {
            select: {
              id: true,
            },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace) {
    notFound();
  }

  if (!workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const currentMembership = workspace.members.find((member) => member.userId === currentUser.id);
  const canManageWorkspaceNotes = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const canUseWhiteboard = workspace.plan !== "FREE";
  const privateNotes = workspace.notes.filter((note) => note.visibility === "PRIVATE");
  const sharedNotes = workspace.notes.filter((note) => note.visibility === "WORKSPACE_SHARED");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                href={`/workspaces/${workspace.id}`}
                className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
              >
                ← {workspace.name}
              </Link>
              <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
                Notes
              </h1>
              <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                Shared documents, whiteboards, and private notes.
              </p>
            </div>

            {/* Primary CTAs */}
            <div className="flex shrink-0 flex-wrap items-start gap-2">
              <form action={createTextNote}>
                <TimezoneInput />
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
                <input type="hidden" name="collaboration" value="COLLABORATIVE" />
                <PendingSubmitButton
                  pendingLabel="Creating..."
                  className="flex items-center gap-2 rounded-full bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  New Note
                </PendingSubmitButton>
              </form>
              {canUseWhiteboard ? (
                <form action={createWhiteboardNote}>
                  <TimezoneInput />
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
                  <input type="hidden" name="collaboration" value="COLLABORATIVE" />
                  <PendingSubmitButton
                    pendingLabel="Creating..."
                    className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                    New Whiteboard
                  </PendingSubmitButton>
                </form>
              ) : (
                <Link
                  href={`/workspaces/${workspace.id}/billing#upgrade`}
                  className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                  New Whiteboard
                  <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
                </Link>
              )}

              {/* Advanced options */}
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]">
                  More
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition group-open:rotate-180"><polyline points="6 9 12 15 18 9" /></svg>
                </summary>
                <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
                  <p className="px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">Private</p>
                  <form action={createTextNote}>
                    <TimezoneInput />
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="visibility" value="PRIVATE" />
                    <PendingSubmitButton pendingLabel="Creating..." className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50">
                      Private Text Note
                    </PendingSubmitButton>
                  </form>
                  <form action={createWhiteboardNote}>
                    <TimezoneInput />
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="visibility" value="PRIVATE" />
                    <PendingSubmitButton pendingLabel="Creating..." className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50">
                      Private Whiteboard
                    </PendingSubmitButton>
                  </form>
                  <div className="my-1 border-t border-[var(--color-border)]" />
                  <p className="px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">View-only Shared</p>
                  <form action={createTextNote}>
                    <TimezoneInput />
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
                    <input type="hidden" name="collaboration" value="SOLO" />
                    <PendingSubmitButton pendingLabel="Creating..." className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50">
                      Shared Text (View-only)
                    </PendingSubmitButton>
                  </form>
                  {canUseWhiteboard ? (
                    <form action={createWhiteboardNote}>
                      <TimezoneInput />
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
                      <input type="hidden" name="collaboration" value="SOLO" />
                      <PendingSubmitButton pendingLabel="Creating..." className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-low)] disabled:opacity-50">
                        Shared Board (View-only)
                      </PendingSubmitButton>
                    </form>
                  ) : (
                    <Link href={`/workspaces/${workspace.id}/billing#upgrade`} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface-low)]">
                      Shared Board (View-only)
                      <span className="rounded-full bg-[var(--color-secondary-dim)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--color-secondary)]">Pro</span>
                    </Link>
                  )}
                </div>
              </details>
            </div>
          </div>

          {/* Status message */}
          {getNoteStatusMessage(noteStatus) ? (
            <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
              {getNoteStatusMessage(noteStatus)}
            </p>
          ) : null}
        </header>

        {/* Sections */}
        <div className="flex flex-col gap-10">
          <NoteSection
            title="Workspace Shared Notes"
            emptyText="Shared notes and whiteboards visible to all workspace members will appear here."
            notes={sharedNotes}
            canManageWorkspaceNotes={canManageWorkspaceNotes}
            currentUserId={currentUser.id}
            workspaceId={workspace.id}
          />

          <NoteSection
            title="My Private Notes"
            emptyText="Private notes you create in this workspace will appear here."
            notes={privateNotes}
            canManageWorkspaceNotes={canManageWorkspaceNotes}
            currentUserId={currentUser.id}
            workspaceId={workspace.id}
          />
        </div>
      </div>
    </div>
  );
}

type NoteCard = {
  id: string;
  title: string;
  type: string;
  visibility: string;
  collaboration: string;
  exportAccess: string;
  ownerUserId: string;
  updatedAt: Date;
  owner: {
    displayName: string;
  };
  artifacts: {
    id: string;
  }[];
};

function NoteSection({
  canManageWorkspaceNotes,
  currentUserId,
  title,
  emptyText,
  notes,
  workspaceId,
}: {
  canManageWorkspaceNotes: boolean;
  currentUserId: string;
  title: string;
  emptyText: string;
  notes: NoteCard[];
  workspaceId: string;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">{title}</h2>
        <span className="rounded-full bg-[var(--color-surface-high)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-muted)]">
          {notes.length}
        </span>
      </div>

      {notes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note) => {
            const canDeleteNote =
              note.visibility === "WORKSPACE_SHARED"
                ? note.ownerUserId === currentUserId || canManageWorkspaceNotes
                : note.ownerUserId === currentUserId;
            const canManageExport =
              note.visibility === "WORKSPACE_SHARED" &&
              (note.ownerUserId === currentUserId || canManageWorkspaceNotes);
            const canExportNote =
              note.visibility === "PRIVATE"
                ? note.ownerUserId === currentUserId
                : note.exportAccess === "WORKSPACE_MEMBERS" || canManageExport;

            const [gradFrom, gradTo] = getGradient(note.title);
            return (
              <article
                key={note.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition hover:border-[var(--color-secondary)] hover:shadow-md"
              >
                {/* Gradient thumbnail */}
                <div
                  className="relative flex h-[88px] w-full items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
                >
                  {note.type === "WHITEBOARD" ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  )}
                  <span className="absolute bottom-2 right-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white/70">
                    {note.type.toLowerCase()}
                  </span>
                </div>

                {/* Card content */}
                <div className="flex flex-col p-5">
                {/* Title */}
                <h3 className="font-display text-base font-semibold text-[var(--color-text)] leading-snug">
                  {note.title}
                </h3>

                {/* Meta */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-[var(--color-subtle)]">
                    {note.owner.displayName}
                  </span>
                  <span className="text-xs text-[var(--color-subtle)]">·</span>
                  <span className="text-xs text-[var(--color-subtle)]">
                    Updated {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>

                {/* Badges */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <CollabBadge collaboration={note.collaboration} />
                  <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-xs text-[var(--color-muted)]">
                    {note.visibility === "WORKSPACE_SHARED" ? "shared" : "private"}
                  </span>
                </div>

                {/* Export access (admin) */}
                {canManageExport ? (
                  <form action={updateNoteExportAccess} className="mt-4 grid gap-2">
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="noteId" value={note.id} />
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-[var(--color-muted)]">Who can export?</span>
                      <select
                        name="exportAccess"
                        defaultValue={note.exportAccess}
                        className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                      >
                        <option value="WORKSPACE_MEMBERS">All workspace members</option>
                        <option value="OWNER_ADMIN_AND_CREATOR">Owner, admins, and creator</option>
                      </select>
                    </label>
                    <PendingSubmitButton
                      pendingLabel="Saving..."
                      className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                    >
                      Save export access
                    </PendingSubmitButton>
                  </form>
                ) : null}

                {/* Actions */}
                <div className="mt-auto pt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/workspaces/${workspaceId}/notes/${note.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-[var(--color-secondary)] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
                  >
                    Open
                  </Link>
                  {canExportNote ? (
                    <a
                      href={`/api/notes/${note.id}/export`}
                      className="rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                    >
                      Export PDF
                    </a>
                  ) : null}
                  {canDeleteNote ? (
                    <DeleteNoteForm
                      isMeetingAttached={note.artifacts.length > 0}
                      noteId={note.id}
                      workspaceId={workspaceId}
                    />
                  ) : null}
                </div>
                </div>{/* end card content */}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <p className="text-sm text-[var(--color-subtle)]">{emptyText}</p>
        </div>
      )}
    </section>
  );
}

function CollabBadge({ collaboration }: { collaboration: string }) {
  if (collaboration === "COLLABORATIVE") {
    return (
      <span className="rounded-full bg-[var(--color-secondary-dim)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
        collaborative
      </span>
    );
  }
  return (
    <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-xs text-[var(--color-muted)]">
      view-only
    </span>
  );
}

function getNoteStatusMessage(status?: string) {
  switch (status) {
    case "deleted":
      return "Note deleted.";
    case "plan-upgrade-required":
    case "shared-whiteboard-upgrade-required":
      return "Shared whiteboards are a Pro feature. You can still create private whiteboards.";
    case "invalid":
      return "Choose a valid note type and visibility.";
    case "unauthorized":
      return "You do not have permission to create notes in this workspace.";
    case "invalid-export":
      return "Choose a valid export setting.";
    case "export-unauthorized":
      return "You do not have permission to change export access for that note.";
    case "export-updated":
      return "Note export access updated.";
    default:
      return null;
  }
}
