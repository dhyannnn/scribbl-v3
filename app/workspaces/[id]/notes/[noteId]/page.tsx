import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessRouteRefresher } from "@/components/AccessRouteRefresher";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { PresenceBar } from "@/components/PresenceBar";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { WhiteboardEditor } from "@/components/WhiteboardEditor";
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

type TextContent = {
  text?: string;
};

type Stroke = {
  points: {
    x: number;
    y: number;
  }[];
};

type WhiteboardPageData = {
  id: string;
  title: string;
  strokes: Stroke[];
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

  const content = note.contentJson as TextContent | null;
  const text = typeof content?.text === "string" ? content.text : "";
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
  const whiteboardPages = getWhiteboardPages(note.contentJson);
  const activeWhiteboardPageId = getActiveWhiteboardPageId(note.contentJson, whiteboardPages);

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
              {canExport ? (
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
                <button className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] sm:w-auto">
                  Save Access
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <LiveblocksRoom
          roomId={liveblocksRoomId}
          initialStorage={
            isTextNote
              ? undefined
              : {
                  whiteboardPages,
                  whiteboardStrokes:
                    whiteboardPages.find((page) => page.id === activeWhiteboardPageId)?.strokes ?? [],
                }
          }
        >
          <PresenceBar />
          {isTextNote ? (
            <TextNoteEditor
              workspaceId={id}
              noteId={note.id}
              title={note.title}
              text={text}
              saveAction={saveTextNote}
              canEdit={canEdit}
              controlsClassName="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            />
          ) : (
            <section className="rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
              <WhiteboardEditor
                workspaceId={id}
                noteId={note.id}
                title={note.title}
                initialStrokes={whiteboardPages.find((page) => page.id === activeWhiteboardPageId)?.strokes ?? []}
                initialPages={whiteboardPages}
                initialActivePageId={activeWhiteboardPageId}
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

function getWhiteboardStrokes(contentJson: unknown) {
  const content = contentJson as { strokes?: unknown } | null;

  if (!Array.isArray(content?.strokes)) {
    return [];
  }

  return content.strokes.filter(isStroke);
}

function getWhiteboardPages(contentJson: unknown) {
  const content = contentJson as { pages?: unknown } | null;

  if (Array.isArray(content?.pages)) {
    const pages = content.pages.filter(isWhiteboardPage);

    if (pages.length > 0) {
      return pages;
    }
  }

  return [
    {
      id: "page-1",
      title: "Page 1",
      strokes: getWhiteboardStrokes(contentJson),
    },
  ];
}

function getActiveWhiteboardPageId(contentJson: unknown, pages: WhiteboardPageData[]) {
  const content = contentJson as { activePageId?: unknown } | null;
  const activePageId = typeof content?.activePageId === "string" ? content.activePageId : null;

  return activePageId && pages.some((page) => page.id === activePageId) ? activePageId : pages[0]?.id ?? "page-1";
}

function isStroke(value: unknown): value is Stroke {
  if (!value || typeof value !== "object" || !("points" in value)) {
    return false;
  }

  const maybeStroke = value as { points?: unknown };
  return (
    Array.isArray(maybeStroke.points) &&
    maybeStroke.points.every(
      (point) =>
        point &&
        typeof point === "object" &&
        typeof (point as { x?: unknown }).x === "number" &&
        typeof (point as { y?: unknown }).y === "number",
    )
  );
}

function isWhiteboardPage(value: unknown): value is WhiteboardPageData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybePage = value as { id?: unknown; title?: unknown; strokes?: unknown };

  return (
    typeof maybePage.id === "string" &&
    typeof maybePage.title === "string" &&
    Array.isArray(maybePage.strokes) &&
    maybePage.strokes.every(isStroke)
  );
}
