import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { createTextNote, createWhiteboardNote, updateNoteExportAccess } from "./actions";
import { DeleteNoteForm } from "./DeleteNoteForm";

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
        include: {
          owner: true,
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
  const privateNotes = workspace.notes.filter((note) => note.visibility === "PRIVATE");
  const sharedNotes = workspace.notes.filter((note) => note.visibility === "WORKSPACE_SHARED");

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d8d8ce] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
              Back to {workspace.name}
            </Link>
            <h1 className="mt-4 text-4xl font-semibold">Notes</h1>
            <p className="mt-3 text-base leading-7 text-[#62645c]">
              Course notes, whiteboards, and saved study materials live here.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <form action={createTextNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="PRIVATE" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60">
                Private Text
              </PendingSubmitButton>
            </form>
            <form action={createTextNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
              <input type="hidden" name="collaboration" value="SOLO" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]">
                Shared Text View-only
              </PendingSubmitButton>
            </form>
            <form action={createWhiteboardNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="PRIVATE" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60">
                Private Board
              </PendingSubmitButton>
            </form>
            <form action={createWhiteboardNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
              <input type="hidden" name="collaboration" value="SOLO" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]">
                Shared Board View-only
              </PendingSubmitButton>
            </form>
            <form action={createTextNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
              <input type="hidden" name="collaboration" value="COLLABORATIVE" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60">
                Collaborative Text
              </PendingSubmitButton>
            </form>
            <form action={createWhiteboardNote}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="visibility" value="WORKSPACE_SHARED" />
              <input type="hidden" name="collaboration" value="COLLABORATIVE" />
              <PendingSubmitButton pendingLabel="Creating..." className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60">
                Collaborative Board
              </PendingSubmitButton>
            </form>
          </div>
        </header>

        {getNoteStatusMessage(noteStatus) ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
            {getNoteStatusMessage(noteStatus)}
          </p>
        ) : null}

        <NoteSection
          title="My Private Notes"
          emptyText="Private notes you create in this workspace will show up here."
          notes={privateNotes}
          canManageWorkspaceNotes={canManageWorkspaceNotes}
          currentUserId={currentUser.id}
          workspaceId={workspace.id}
        />

        <NoteSection
          title="Workspace Shared Notes"
          emptyText="Shared notes and whiteboards for the whole workspace will show up here."
          notes={sharedNotes}
          canManageWorkspaceNotes={canManageWorkspaceNotes}
          currentUserId={currentUser.id}
          workspaceId={workspace.id}
        />
      </div>
    </main>
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
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
          {notes.length}
        </span>
      </div>
      {notes.length > 0 ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            const isMeetingAttached = note.artifacts.length > 0;

            return (
              <article key={note.id} className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-[#2f604b]">{note.type.toLowerCase()}</p>
                <h3 className="mt-2 text-lg font-semibold">{note.title}</h3>
                <p className="mt-3 text-sm text-[#66685f]">
                  Updated {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#777970]">
                  {formatEnumLabel(note.visibility, "WORKSPACE_SHARED")} /{" "}
                  {formatEnumLabel(note.collaboration, "SOLO")}
                </p>
                <p className="mt-2 text-xs text-[#777970]">Export: {getExportAccessLabel(note)}</p>
                <p className="mt-2 text-xs text-[#777970]">Owner: {note.owner.displayName}</p>
                <div className="mt-5 rounded-md bg-[#fbfbf8] p-4 text-sm leading-6 text-[#4d4f47]">
                  {getNoteActionLabel(note)}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/workspaces/${workspaceId}/notes/${note.id}`}
                    className="rounded-md bg-[#2f604b] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
                  >
                    Open
                  </Link>
                  {canExportNote ? (
                    <a
                      href={`/api/notes/${note.id}/export`}
                      className="rounded-md border border-[#2f604b] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]"
                    >
                      Export PDF
                    </a>
                  ) : null}
                  {canDeleteNote ? (
                    <DeleteNoteForm
                      isMeetingAttached={isMeetingAttached}
                      noteId={note.id}
                      workspaceId={workspaceId}
                    />
                  ) : null}
                </div>
                {canManageExport ? (
                  <form action={updateNoteExportAccess} className="mt-4 grid gap-2">
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="noteId" value={note.id} />
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-[#4d4f47]">Who can export?</span>
                      <select
                        name="exportAccess"
                        defaultValue={note.exportAccess}
                        className="min-h-10 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                      >
                        <option value="WORKSPACE_MEMBERS">All workspace members</option>
                        <option value="OWNER_ADMIN_AND_CREATOR">Owner, admins, and creator</option>
                      </select>
                    </label>
                    <PendingSubmitButton
                      pendingLabel="Saving..."
                      className="rounded-md border border-[#c8c8bd] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:border-[#2f604b] hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save Export Access
                    </PendingSubmitButton>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-[#c8c8bd] bg-white p-8 text-center text-sm text-[#66685f]">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function formatEnumLabel(value: string | null | undefined, fallback: string) {
  return (value ?? fallback).toLowerCase().replaceAll("_", " ");
}

function getNoteActionLabel(note: NoteCard) {
  if (note.visibility === "PRIVATE") {
    return "Open private editor";
  }

  if (note.collaboration === "COLLABORATIVE") {
    return "Open collaborative editor";
  }

  return "Open owner-only note";
}

function getExportAccessLabel(note: NoteCard) {
  if (note.visibility === "PRIVATE") {
    return "Only owner";
  }

  return note.exportAccess === "WORKSPACE_MEMBERS"
    ? "All workspace members"
    : "Owner, admins, and creator";
}

function getNoteStatusMessage(status?: string) {
  switch (status) {
    case "deleted":
      return "Note deleted.";
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
