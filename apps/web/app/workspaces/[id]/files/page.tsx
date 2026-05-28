import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import {
  getWorkspaceSharedStorageBytes,
  getSharedStorageLimitBytes,
  getUserPrivateStorageBytes,
  getPrivateStorageLimitPerUserBytes,
} from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceFile, uploadWorkspaceFile, togglePinFile } from "./actions";
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

  const [workspace, sharedStorageBytes, privateStorageBytes] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: "ACTIVE" },
          select: { userId: true, role: true },
        },
        files: {
          where: {
            OR: [
              { visibility: "WORKSPACE_SHARED" },
              { visibility: "PRIVATE", uploadedByUserId: currentUser.id },
            ],
          },
          select: {
            id: true,
            name: true,
            mimeType: true,
            sizeBytes: true,
            visibility: true,
            isPinned: true,
            storageKey: true,
            uploadedByUserId: true,
            createdAt: true,
            uploadedBy: { select: { displayName: true } },
            noteContentFor: { select: { id: true } },
            artifacts: { select: { id: true }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    getWorkspaceSharedStorageBytes(id),
    getUserPrivateStorageBytes(currentUser.id, id),
  ]);

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

  const currentMembership = workspace.members.find((m) => m.userId === currentUser.id);
  const canManageWorkspaceFiles = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  const sharedStorageLimit = getSharedStorageLimitBytes(workspace.plan);
  const sharedStoragePercent = Math.min(100, (sharedStorageBytes / sharedStorageLimit) * 100);
  const isSharedWarning = sharedStoragePercent >= 80;
  const isSharedCritical = sharedStoragePercent >= 95;

  const privateStorageLimit = getPrivateStorageLimitPerUserBytes(workspace.plan);
  const privateStoragePercent = Math.min(100, (privateStorageBytes / privateStorageLimit) * 100);
  const isPrivateWarning = privateStoragePercent >= 80;
  const isPrivateCritical = privateStoragePercent >= 95;

  const sharedFiles = workspace.files.filter((f) => f.visibility === "WORKSPACE_SHARED");
  const privateFiles = workspace.files.filter((f) => f.visibility === "PRIVATE");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Header */}
        <header className="mb-8">
          <Link
            href={`/workspaces/${workspace.id}`}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
            Files
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            PDFs, exports, recordings, and uploaded resources.
          </p>
        </header>

        {/* Storage meters */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <StorageMeter
            label="Shared storage"
            used={sharedStorageBytes}
            limit={sharedStorageLimit}
            percent={sharedStoragePercent}
            isWarning={isSharedWarning}
            isCritical={isSharedCritical}
            upgradeHref={workspace.plan === "FREE" ? `/workspaces/${workspace.id}/billing#upgrade` : undefined}
          />
          <StorageMeter
            label="Your private storage"
            used={privateStorageBytes}
            limit={privateStorageLimit}
            percent={privateStoragePercent}
            isWarning={isPrivateWarning}
            isCritical={isPrivateCritical}
            upgradeHref={workspace.plan === "FREE" ? `/workspaces/${workspace.id}/billing#upgrade` : undefined}
          />
        </div>

        {/* Upload form */}
        <div className="mb-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">Upload file</h2>

          {fileStatus === "storage-limit" || fileStatus === "private-storage-limit" ? (
            <div className="mt-3 rounded-xl border border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--color-warning)]">
                {fileStatus === "private-storage-limit"
                  ? "Your private storage limit is full. "
                  : "Shared storage limit reached. "}
                {workspace.plan === "FREE" ? (
                  <Link href={`/workspaces/${workspace.id}/billing#upgrade`} className="underline hover:no-underline">
                    Upgrade to Pro →
                  </Link>
                ) : null}
              </p>
            </div>
          ) : getFileStatusMessage(fileStatus) ? (
            <p className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
              {getFileStatusMessage(fileStatus)}
            </p>
          ) : null}

          <form action={uploadWorkspaceFile} className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-muted)]">File</span>
              <input
                name="file"
                type="file"
                required
                className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--color-secondary-dim)] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[var(--color-secondary)] focus:border-[var(--color-secondary)]"
              />
            </label>
            <label className="flex flex-col gap-1.5 sm:w-48">
              <span className="text-xs font-medium text-[var(--color-muted)]">Visibility</span>
              <select
                name="visibility"
                defaultValue="WORKSPACE_SHARED"
                className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
              >
                <option value="WORKSPACE_SHARED">Workspace shared</option>
                <option value="PRIVATE">Private</option>
              </select>
            </label>
            <PendingSubmitButton
              pendingLabel="Uploading..."
              className="min-h-10 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white transition hover:opacity-80 disabled:opacity-50"
            >
              Upload
            </PendingSubmitButton>
          </form>
        </div>

        {/* File sections */}
        <div className="flex flex-col gap-10">
          <FileSection
            title="Workspace Shared Files"
            emptyText="Shared uploads and workspace resources will appear here."
            files={sharedFiles}
            canManageWorkspaceFiles={canManageWorkspaceFiles}
            currentUserId={currentUser.id}
            workspaceId={workspace.id}
            showPinControl
          />
          <FileSection
            title="My Private Files"
            emptyText="Private uploads and exported notes will appear here."
            files={privateFiles}
            canManageWorkspaceFiles={canManageWorkspaceFiles}
            currentUserId={currentUser.id}
            workspaceId={workspace.id}
            showPinControl={false}
          />
        </div>
      </div>
    </div>
  );
}

type FileCard = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  visibility: string;
  isPinned: boolean;
  storageKey: string;
  uploadedByUserId: string;
  createdAt: Date;
  uploadedBy: { displayName: string };
  noteContentFor: { id: string } | null;
  artifacts: { id: string }[];
};

function FileSection({
  canManageWorkspaceFiles,
  currentUserId,
  title,
  emptyText,
  files,
  workspaceId,
  showPinControl,
}: {
  canManageWorkspaceFiles: boolean;
  currentUserId: string;
  title: string;
  emptyText: string;
  files: FileCard[];
  workspaceId: string;
  showPinControl: boolean;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">{title}</h2>
        <span className="rounded-full bg-[var(--color-surface-high)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-muted)]">
          {files.length}
        </span>
      </div>

      {files.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((file) => {
            const canDeleteFile =
              file.visibility === "WORKSPACE_SHARED"
                ? canManageWorkspaceFiles || file.uploadedByUserId === currentUserId
                : file.uploadedByUserId === currentUserId;
            const canUpdateFile = canDeleteFile;
            const isNoteContent = Boolean(file.noteContentFor);
            const canPin = showPinControl && canManageWorkspaceFiles;

            return (
              <article
                key={file.id}
                className="relative flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm transition hover:border-[var(--color-secondary)] hover:shadow-md"
              >
                {/* Pin badge */}
                {file.isPinned ? (
                  <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-secondary-dim)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-secondary)" stroke="none"><path d="M12 2a1 1 0 0 1 .894.553l2.618 5.302 5.853.85a1 1 0 0 1 .554 1.706l-4.235 4.127.999 5.826a1 1 0 0 1-1.451 1.054L12 18.897l-5.232 2.751a1 1 0 0 1-1.451-1.054l.999-5.826L2.081 10.41a1 1 0 0 1 .554-1.706l5.853-.85 2.618-5.302A1 1 0 0 1 12 2z" /></svg>
                  </span>
                ) : null}

                {/* Type icon */}
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-low)]">
                  <FileTypeIcon mimeType={file.mimeType} />
                </div>

                {/* Name */}
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--color-text)]">
                  {file.name}
                </h3>

                {/* Meta */}
                <p className="mt-1.5 text-xs text-[var(--color-subtle)]">
                  {formatFileSize(file.sizeBytes)} · {file.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-subtle)]">
                  {file.uploadedBy.displayName}
                </p>

                {isNoteContent ? (
                  <p className="mt-2 text-xs font-medium text-[var(--color-warning)]">
                    Note content — cannot delete
                  </p>
                ) : null}

                {/* Rename (expandable) */}
                {canUpdateFile ? (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer list-none text-xs font-medium text-[var(--color-secondary)] hover:underline">
                      Rename
                    </summary>
                    <form action={updateWorkspaceFile} className="mt-2 flex gap-2">
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="fileId" value={file.id} />
                      <input
                        name="name"
                        required
                        defaultValue={file.name}
                        className="min-h-8 min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 text-xs outline-none transition focus:border-[var(--color-secondary)]"
                      />
                      <PendingSubmitButton
                        pendingLabel="..."
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                      >
                        Save
                      </PendingSubmitButton>
                    </form>
                  </details>
                ) : null}

                {/* Actions */}
                <div className="mt-auto pt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/api/files/${file.id}`}
                    target="_blank"
                    className="rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-80"
                  >
                    Open
                  </Link>
                  {canPin ? (
                    <form action={togglePinFile}>
                      <input type="hidden" name="workspaceId" value={workspaceId} />
                      <input type="hidden" name="fileId" value={file.id} />
                      <PendingSubmitButton
                        pendingLabel="..."
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          file.isPinned
                            ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
                            : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                        }`}
                      >
                        {file.isPinned ? "Unpin" : "Pin"}
                      </PendingSubmitButton>
                    </form>
                  ) : null}
                  {canDeleteFile ? (
                    <DeleteFileForm
                      disabled={isNoteContent}
                      fileId={file.id}
                      isMeetingAttached={file.artifacts.length > 0}
                      workspaceId={workspaceId}
                    />
                  ) : null}
                </div>
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

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/pdf") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function formatFileSize(sizeBytes: number | null) {
  if (!sizeBytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function StorageMeter({
  label,
  used,
  limit,
  percent,
  isWarning,
  isCritical,
  upgradeHref,
}: {
  label: string;
  used: number;
  limit: number;
  percent: number;
  isWarning: boolean;
  isCritical: boolean;
  upgradeHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
        <span className={`font-mono text-xs font-semibold ${
          isCritical ? "text-[var(--color-danger)]" : isWarning ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"
        }`}>
          {formatFileSize(used)} / {formatFileSize(limit)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-high)]">
        <div
          className={`h-full rounded-full transition-all ${
            isCritical ? "bg-[var(--color-danger)]" : isWarning ? "bg-[var(--color-warning)]" : "bg-[var(--color-secondary)]"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {(isCritical || isWarning) && upgradeHref ? (
        <p className={`mt-1.5 text-xs ${isCritical ? "text-[var(--color-danger)]" : "text-[var(--color-warning)]"}`}>
          {isCritical ? "Limit reached." : "Approaching limit."}{" "}
          <a href={upgradeHref} className="underline hover:no-underline">Upgrade →</a>
        </p>
      ) : null}
    </div>
  );
}

function getFileStatusMessage(status?: string) {
  switch (status) {
    case "deleted":
      return "File deleted.";
    case "updated":
      return "File renamed.";
    case "uploaded":
      return "File uploaded.";
    case "pinned":
      return "File pinned to chat.";
    case "unpinned":
      return "File unpinned.";
    case "pin-limit":
      return "Pinned file limit reached (max 10 per workspace).";
    case "upload-invalid":
      return "Choose a valid file and visibility before uploading.";
    case "upload-too-large":
      return "Files must be 20 MB or smaller.";
    case "storage-limit":
      return "This workspace has reached its shared storage limit.";
    case "private-storage-limit":
      return "You have reached your private storage limit.";
    case "upload-failed":
      return "The file could not be uploaded. Try again.";
    case "delete-attached":
      return "This file is used as note content and cannot be deleted yet.";
    case "delete-failed":
      return "The file could not be deleted. Try again.";
    case "unauthorized":
      return "You do not have permission to change that file.";
    default:
      return null;
  }
}
