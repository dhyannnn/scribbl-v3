import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceFile, uploadWorkspaceFile } from "./actions";
import { DeleteFileForm } from "./DeleteFileForm";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string }>;
};

export default async function FilesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { file: fileStatus } = await searchParams;

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
      files: {
        where: {
          OR: [
            {
              visibility: "WORKSPACE_SHARED",
            },
            {
              visibility: "PRIVATE",
              uploadedByUserId: currentUser.id,
            },
          ],
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          visibility: true,
          storageKey: true,
          uploadedByUserId: true,
          createdAt: true,
          uploadedBy: {
            select: {
              displayName: true,
            },
          },
          noteContentFor: {
            select: {
              id: true,
            },
          },
          artifacts: {
            select: {
              id: true,
            },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
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
  const canManageWorkspaceFiles = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const privateFiles = workspace.files.filter((file) => file.visibility === "PRIVATE");
  const sharedFiles = workspace.files.filter((file) => file.visibility === "WORKSPACE_SHARED");

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[#d8d8ce] pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
              Back to {workspace.name}
            </Link>
            <h1 className="mt-4 text-4xl font-semibold">Files</h1>
            <p className="mt-3 text-base leading-7 text-[#62645c]">
              PDFs, exported whiteboards, uploads, and meeting recordings.
            </p>
          </div>
        </header>

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Upload File</h2>
          {getFileStatusMessage(fileStatus) ? (
            <p className="mt-3 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] px-3 py-2 text-sm text-[#4d4f47]">
              {getFileStatusMessage(fileStatus)}
            </p>
          ) : null}
          <form action={uploadWorkspaceFile} className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_auto]">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">File</span>
              <input
                name="file"
                type="file"
                required
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 py-2 text-sm outline-none transition file:mr-4 file:rounded-md file:border-0 file:bg-[#e7eee7] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#2f604b] focus:border-[#2f604b] focus:bg-white"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Visibility</span>
              <select
                name="visibility"
                defaultValue="WORKSPACE_SHARED"
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
              >
                <option value="WORKSPACE_SHARED">Workspace shared</option>
                <option value="PRIVATE">Private</option>
              </select>
            </label>
            <div className="flex items-end">
              <PendingSubmitButton
                pendingLabel="Uploading..."
                className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
              >
                Upload
              </PendingSubmitButton>
            </div>
          </form>
        </section>

        <FileSection
          title="My Private Files"
          emptyText="Private uploads and exported notes will show up here."
          files={privateFiles}
          canManageWorkspaceFiles={canManageWorkspaceFiles}
          currentUserId={currentUser.id}
          workspaceId={workspace.id}
        />

        <FileSection
          title="Workspace Shared Files"
          emptyText="Shared uploads, lecture files, and workspace resources will show up here."
          files={sharedFiles}
          canManageWorkspaceFiles={canManageWorkspaceFiles}
          currentUserId={currentUser.id}
          workspaceId={workspace.id}
        />
      </div>
    </main>
  );
}

type FileCard = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  visibility: string;
  storageKey: string;
  uploadedByUserId: string;
  createdAt: Date;
  uploadedBy: {
    displayName: string;
  };
  noteContentFor: {
    id: string;
  } | null;
  artifacts: {
    id: string;
  }[];
};

function FileSection({
  canManageWorkspaceFiles,
  currentUserId,
  title,
  emptyText,
  files,
  workspaceId,
}: {
  canManageWorkspaceFiles: boolean;
  currentUserId: string;
  title: string;
  emptyText: string;
  files: FileCard[];
  workspaceId: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
          {files.length}
        </span>
      </div>
      {files.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {files.map((file) => {
            const canDeleteFile =
              file.visibility === "WORKSPACE_SHARED"
                ? canManageWorkspaceFiles || file.uploadedByUserId === currentUserId
                : file.uploadedByUserId === currentUserId;
            const canUpdateFile = canDeleteFile;
            const isNoteContent = Boolean(file.noteContentFor);
            const isMeetingAttached = file.artifacts.length > 0;

            return (
              <article key={file.id} className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#2f604b]">{formatEnumLabel(file.visibility)}</p>
                    <h3 className="mt-2 text-lg font-semibold">{file.name}</h3>
                    <p className="mt-2 text-sm text-[#66685f]">
                      {formatFileType(file.mimeType)} uploaded by {file.uploadedBy.displayName}
                    </p>
                    <p className="mt-2 text-xs text-[#777970]">
                      {formatFileSize(file.sizeBytes)} /{" "}
                      {file.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    {isNoteContent ? (
                      <p className="mt-2 text-xs font-medium text-[#7a5a1f]">
                        Note content files cannot be deleted yet.
                      </p>
                    ) : null}
                    {canUpdateFile ? (
                      <form action={updateWorkspaceFile} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="fileId" value={file.id} />
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-medium text-[#4d4f47]">File name</span>
                          <input
                            name="name"
                            required
                            defaultValue={file.name}
                            className="min-h-10 min-w-0 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                          />
                        </label>
                        <div className="flex items-end">
                          <PendingSubmitButton
                            pendingLabel="Renaming..."
                            className="min-h-10 w-full rounded-md border border-[#2f604b] bg-white px-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          >
                            Rename
                          </PendingSubmitButton>
                        </div>
                      </form>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link
                      href={`/api/files/${file.id}`}
                      className="rounded-md bg-[#2f604b] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[#244b3a]"
                      target="_blank"
                    >
                      Open
                    </Link>
                    {canDeleteFile ? (
                      <DeleteFileForm
                        disabled={isNoteContent}
                        fileId={file.id}
                        isMeetingAttached={isMeetingAttached}
                        workspaceId={workspaceId}
                      />
                    ) : null}
                  </div>
                </div>
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

function formatEnumLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatFileType(mimeType: string) {
  if (mimeType === "application/pdf") {
    return "PDF";
  }

  if (mimeType.startsWith("image/")) {
    return `${mimeType.replace("image/", "").toUpperCase()} image`;
  }

  if (mimeType.startsWith("video/")) {
    return `${mimeType.replace("video/", "").toUpperCase()} video`;
  }

  if (mimeType.startsWith("audio/")) {
    return `${mimeType.replace("audio/", "").toUpperCase()} audio`;
  }

  if (mimeType.includes("wordprocessingml") || mimeType === "application/msword") {
    return "Word document";
  }

  if (mimeType.includes("presentationml") || mimeType === "application/vnd.ms-powerpoint") {
    return "Presentation";
  }

  if (mimeType.includes("spreadsheetml") || mimeType === "application/vnd.ms-excel") {
    return "Spreadsheet";
  }

  if (mimeType === "text/plain") {
    return "Text file";
  }

  return mimeType || "File";
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) {
    return "Size unknown";
  }

  const units = ["bytes", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function getFileStatusMessage(status?: string) {
  switch (status) {
    case "deleted":
      return "File deleted from Scribbl and Supabase Storage.";
    case "updated":
      return "File renamed.";
    case "uploaded":
      return "File uploaded.";
    case "upload-invalid":
      return "Choose a valid file and visibility before uploading.";
    case "upload-too-large":
      return "Files must be 20 MB or smaller.";
    case "upload-failed":
      return "The file could not be uploaded. Try again in a moment.";
    case "delete-attached":
      return "This file is used as note content, so it cannot be deleted yet.";
    case "delete-failed":
      return "The file could not be deleted from storage. Try again in a moment.";
    case "unauthorized":
      return "You do not have permission to change that file.";
    default:
      return null;
  }
}
