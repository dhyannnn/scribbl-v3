import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Search — Scribbl" };

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function SearchPage({ searchParams }: PageProps) {
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim() ?? "";

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: currentUser.id, status: "ACTIVE" },
    select: { workspaceId: true },
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);

  const hasQuery = q.length > 0;
  const hasWorkspaces = workspaceIds.length > 0;

  const [notes, meetings, files, messages] = hasQuery && hasWorkspaces
    ? await Promise.all([
        prisma.note.findMany({
          where: {
            deletedAt: null,
            title: { contains: q, mode: "insensitive" },
            OR: [
              { ownerUserId: currentUser.id },
              { workspaceId: { in: workspaceIds }, visibility: "WORKSPACE_SHARED" },
            ],
          },
          select: {
            id: true, title: true, type: true, workspaceId: true, updatedAt: true,
            workspace: { select: { name: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
        }),
        prisma.meeting.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            title: { contains: q, mode: "insensitive" },
          },
          select: {
            id: true, title: true, startsAt: true, workspaceId: true,
            workspace: { select: { name: true } },
          },
          orderBy: { startsAt: "desc" },
          take: 20,
        }),
        prisma.file.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            name: { contains: q, mode: "insensitive" },
            OR: [
              { uploadedByUserId: currentUser.id },
              { visibility: "WORKSPACE_SHARED" },
            ],
          },
          select: {
            id: true, name: true, mimeType: true, sizeBytes: true,
            workspaceId: true, createdAt: true,
            workspace: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.message.findMany({
          where: {
            deletedAt: null,
            body: { contains: q, mode: "insensitive" },
            channel: { workspaceId: { in: workspaceIds } },
          },
          select: {
            id: true, body: true, createdAt: true,
            sender: { select: { displayName: true } },
            channel: {
              select: {
                id: true, name: true, workspaceId: true,
                workspace: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ])
    : [[], [], [], []];

  const totalResults = notes.length + meetings.length + files.length + messages.length;

  return (
    <div className="mx-auto max-w-[760px] px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Search</h1>
        {hasQuery && totalResults > 0 && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
          </p>
        )}
      </div>

      {/* Search form */}
      <form action="/search" method="GET" className="mb-8">
        <div className="relative flex items-center">
          <svg
            className="pointer-events-none absolute left-4 text-[var(--color-muted)]"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!hasQuery}
            placeholder="Search notes, meetings, files, messages…"
            className="h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-24 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] placeholder:text-[var(--color-subtle)]"
          />
          <button
            type="submit"
            className="absolute right-2 rounded-full bg-[var(--color-secondary)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            Search
          </button>
        </div>
      </form>

      {/* Empty / no-query state */}
      {!hasQuery && (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--color-surface-mid)] text-[var(--color-muted)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <p className="font-semibold text-[var(--color-text)]">Search across your workspaces</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Find notes, meetings, files, and chat messages. Or press{" "}
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-mid)] px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
            {" "}for quick search.
          </p>
        </div>
      )}

      {/* No results */}
      {hasQuery && totalResults === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="font-semibold text-[var(--color-text)]">No results for &ldquo;{q}&rdquo;</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Try different keywords or check your spelling.</p>
        </div>
      )}

      {/* Results */}
      {hasQuery && totalResults > 0 && (
        <div className="space-y-8">
          {/* Notes */}
          {notes.length > 0 && (
            <section>
              <SectionHeader icon={<NoteIcon />} label="Notes" count={notes.length} />
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {notes.map((note) => (
                  <li key={note.id}>
                    <Link
                      href={note.workspaceId ? `/workspaces/${note.workspaceId}/notes/${note.id}` : "#"}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--color-surface-low)]"
                    >
                      <span className="shrink-0 text-[var(--color-muted)]">
                        {note.type === "WHITEBOARD" ? <WhiteboardIcon /> : <NoteIcon />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                          <Highlight text={note.title || "Untitled"} query={q} />
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)]">
                          {note.workspace?.name} · {note.type === "WHITEBOARD" ? "Whiteboard" : "Note"} · updated {timeAgo(note.updatedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Meetings */}
          {meetings.length > 0 && (
            <section>
              <SectionHeader icon={<MeetingIcon />} label="Meetings" count={meetings.length} />
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <Link
                      href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--color-surface-low)]"
                    >
                      <span className="shrink-0 text-[var(--color-muted)]"><MeetingIcon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                          <Highlight text={meeting.title || "Untitled Meeting"} query={q} />
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)]">
                          {meeting.workspace?.name} · {meeting.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Files */}
          {files.length > 0 && (
            <section>
              <SectionHeader icon={<FileIcon />} label="Files" count={files.length} />
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {files.map((file) => (
                  <li key={file.id}>
                    <Link
                      href={file.workspaceId ? `/workspaces/${file.workspaceId}/files` : "#"}
                      className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--color-surface-low)]"
                    >
                      <span className="shrink-0 text-[var(--color-muted)]">
                        <FileTypeIcon mimeType={file.mimeType} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                          <Highlight text={file.name} query={q} />
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)]">
                          {file.workspace?.name}
                          {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ""}
                          {` · ${timeAgo(file.createdAt)}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <section>
              <SectionHeader icon={<MessageIcon />} label="Messages" count={messages.length} />
              <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                {messages.map((msg) => (
                  <li key={msg.id}>
                    <Link
                      href={`/workspaces/${msg.channel.workspaceId}/chat/${msg.channel.id}`}
                      className="block px-5 py-3.5 transition hover:bg-[var(--color-surface-low)]"
                    >
                      <p className="text-xs font-semibold text-[var(--color-muted)]">
                        {msg.sender.displayName} · #{msg.channel.name} · {msg.channel.workspace?.name}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--color-text)]">
                        <Highlight text={msg.body} query={q} />
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-subtle)]">{timeAgo(msg.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--color-muted)]">{icon}</span>
      <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      <span className="rounded-full bg-[var(--color-surface-mid)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--color-subtle)]">
        {count}
      </span>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[var(--color-secondary-dim)] text-[var(--color-secondary)] not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function NoteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function WhiteboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function MeetingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13,2 13,9 20,9" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
    );
  }
  if (mimeType === "application/pdf") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14,2 14,8 20,8" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    );
  }
  return <FileIcon />;
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
