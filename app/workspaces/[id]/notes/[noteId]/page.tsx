import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessRouteRefresher } from "@/components/AccessRouteRefresher";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { getCurrentUser } from "@/lib/current-user";
import { createNoteRoomId } from "@/lib/liveblocks-room";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { saveTextNote, saveWhiteboardNote, updateNoteExportAccess } from "../actions";

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
    (note.ownerUserId === currentUser.id || note.collaboration === "COLLABORATIVE");
  const canManageExport =
    note.visibility === "WORKSPACE_SHARED" && (note.ownerUserId === currentUser.id || canManageWorkspaceNotes);
  const canExport =
    note.visibility === "PRIVATE"
      ? note.ownerUserId === currentUser.id
      : note.exportAccess === "WORKSPACE_MEMBERS" || canManageExport;
  const liveblocksRoomId = createNoteRoomId(id, note.id);
  const tldrawSnapshot = isTextNote ? null : getTldrawSnapshot(note.contentJson);

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <AccessRouteRefresher />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${id}/notes`} className="text-sm font-medium text-[#2f604b]">
            Back to notes
          </Link>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                {note.workspace.name} / {note.type.toLowerCase()}
              </p>
              <h1 className="mt-2 text-4xl font-semibold">Note Editor</h1>
              <p className="mt-3 text-sm text-[#62645c]">
                {formatEnumLabel(note.visibility, "WORKSPACE_SHARED")} /{" "}
                {formatEnumLabel(note.collaboration, "SOLO")} / {formatEnumLabel(note.sourceDevice, "WEB")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canExport && isTextNote ? (
                <a
                  href={`/api/notes/${note.id}/export`}
                  className="rounded-md bg-[#2f604b] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#244b3a]"
                >
                  Export PDF
                </a>
              ) : null}
              <div className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#66685f] shadow-sm">
                Owner: {note.owner.displayName}
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-[#62645c]">
            Export: {getExportAccessLabel(note.visibility, note.exportAccess)}
          </p>
          {isLockedByMeeting ? (
            <p className="mt-5 rounded-md border border-[#ead1cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#7a3434]">
              This note is attached to a locked meeting, so it is read-only.
            </p>
          ) : null}
        </header>

        {canManageExport ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Export Access</h2>
            <form action={updateNoteExportAccess} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input type="hidden" name="workspaceId" value={id} />
              <input type="hidden" name="noteId" value={note.id} />
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Who can export this shared note?</span>
                <select
                  name="exportAccess"
                  defaultValue={note.exportAccess}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                >
                  <option value="WORKSPACE_MEMBERS">All workspace members</option>
                  <option value="OWNER_ADMIN_AND_CREATOR">Owner, admins, and creator</option>
                </select>
              </label>
              <div className="flex items-end">
                <PendingSubmitButton
                  pendingLabel="Saving..."
                  className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  Save Access
                </PendingSubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        <LiveblocksRoom roomId={liveblocksRoomId}>
          {isTextNote ? (
            <TextNoteEditor
              workspaceId={id}
              noteId={note.id}
              title={note.title}
              contentJson={note.contentJson}
              saveAction={saveTextNote}
              canEdit={canEdit}
            />
          ) : (
            <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
              <TldrawWhiteboardEditor
                workspaceId={id}
                noteId={note.id}
                title={note.title}
                initialSnapshot={tldrawSnapshot}
                saveAction={saveWhiteboardNote}
                canEdit={canEdit}
              />
            </section>
          )}
        </LiveblocksRoom>
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
