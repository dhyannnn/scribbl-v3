import type { Metadata } from "next";
import Link from "next/link";
import type { NotificationType } from "@prisma/client";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Notifications — Scribbl" };

type Props = { searchParams: Promise<{ filter?: string }> };

const FILTER_TYPES: Record<string, NotificationType[]> = {
  meeting: ["MEETING_SCHEDULED", "MEETING_UPDATED", "MEETING_CANCELED"],
  note: ["NOTE_SHARED"],
  file: ["FILE_SHARED"],
  announcement: ["ANNOUNCEMENT_POSTED"],
  chat: ["CHAT_MESSAGE"],
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "meeting", label: "Meetings" },
  { key: "note", label: "Notes" },
  { key: "file", label: "Files" },
  { key: "announcement", label: "Announcements" },
  { key: "chat", label: "Chat" },
];

export default async function NotificationsPage({ searchParams }: Props) {
  const [{ filter = "all" }, currentUser] = await Promise.all([searchParams, getCurrentUser()]);

  if (!currentUser) return <ProtectedPageMessage />;

  const typeFilter = FILTER_TYPES[filter];

  const notifications = await prisma.notification.findMany({
    where: {
      userId: currentUser.id,
      ...(typeFilter ? { type: { in: typeFilter } } : {}),
    },
    select: {
      id: true, title: true, body: true, href: true,
      readAt: true, createdAt: true, type: true,
      workspace: { select: { name: true } },
      actor: { select: { displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const totalUnread = notifications.filter((n) => !n.readAt).length;
  const groups = groupByDate(notifications as NotificationRow[]);

  return (
    <div className="mx-auto max-w-[700px] px-6 py-10">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Notifications</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {totalUnread > 0
              ? `${totalUnread} unread`
              : "You're all caught up"}
          </p>
        </div>
        {totalUnread > 0 && (
          <form action={markAllNotificationsRead}>
            <button
              type="submit"
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              Mark all read
            </button>
          </form>
        )}
      </div>

      {/* Filter chips */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/notifications" : `/notifications?filter=${f.key}`}
            className={`rounded-full px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition ${
              (f.key === "all" ? !filter || filter === "all" : filter === f.key)
                ? "bg-[var(--color-secondary)] text-white"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {notifications.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--color-surface-mid)] text-[var(--color-muted)]">
            <BellIcon />
          </div>
          <p className="font-semibold text-[var(--color-text)]">
            {filter === "all" ? "No notifications yet" : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} notifications`}
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Announcements, meeting updates, and shared content will appear here.
          </p>
        </div>
      )}

      {/* Grouped notification list */}
      {groups.map(({ label, items }) =>
        items.length === 0 ? null : (
          <div key={label} className="mb-8">
            <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-subtle)]">
              {label}
            </p>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              {items.map((n, i) => (
                <form key={n.id} action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={n.id} />
                  <input type="hidden" name="href" value={n.href} />
                  <button
                    type="submit"
                    className={`flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-[var(--color-surface-low)] ${
                      i > 0 ? "border-t border-[var(--color-border)]" : ""
                    } ${!n.readAt ? "bg-[var(--color-secondary-dim)]/30" : ""}`}
                  >
                    {/* Type icon */}
                    <div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${getIconBg(n.type)}`}>
                      {getTypeIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${getTypeLabelColor(n.type)}`}>
                          {getNotificationTypeLabel(n.type)}
                        </span>
                        {!n.readAt && (
                          <span className="size-1.5 rounded-full bg-[var(--color-secondary)]" aria-label="Unread" />
                        )}
                      </div>
                      <p className={`mt-0.5 text-sm font-semibold leading-snug ${n.readAt ? "text-[var(--color-muted)]" : "text-[var(--color-text)]"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)] line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-[var(--color-subtle)]">
                        {n.workspace?.name && <span>{n.workspace.name} · </span>}
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                </form>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Date grouping ────────────────────────────────────────────────────────────

// Infer from the Prisma query so it always stays in sync
type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string;
  readAt: Date | null;
  createdAt: Date;
  type: NotificationType;
  workspace: { name: string } | null;
  actor: { displayName: string; avatarUrl: string | null } | null;
};

function groupByDate(items: NotificationRow[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);

  const today: NotificationRow[] = [];
  const yesterday: NotificationRow[] = [];
  const thisWeek: NotificationRow[] = [];
  const earlier: NotificationRow[] = [];

  for (const n of items) {
    const t = n.createdAt.getTime();
    if (t >= startOfToday.getTime()) today.push(n);
    else if (t >= startOfYesterday.getTime()) yesterday.push(n);
    else if (t >= startOfWeek.getTime()) thisWeek.push(n);
    else earlier.push(n);
  }

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "This week", items: thisWeek },
    { label: "Earlier", items: earlier },
  ];
}

// ── Type helpers ─────────────────────────────────────────────────────────────

function getNotificationTypeLabel(type: string) {
  switch (type) {
    case "ANNOUNCEMENT_POSTED": return "Announcement";
    case "CHAT_MESSAGE": return "Chat";
    case "MEETING_SCHEDULED":
    case "MEETING_UPDATED":
    case "MEETING_CANCELED": return "Meeting";
    case "FILE_SHARED": return "File";
    case "NOTE_SHARED": return "Note";
    default: return "Update";
  }
}

function getIconBg(type: string) {
  switch (type) {
    case "MEETING_SCHEDULED":
    case "MEETING_UPDATED":
    case "MEETING_CANCELED": return "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]";
    case "ANNOUNCEMENT_POSTED": return "bg-[var(--color-warning-dim)] text-[var(--color-warning)]";
    case "NOTE_SHARED": return "bg-[var(--color-success-dim)] text-[var(--color-success)]";
    case "FILE_SHARED": return "bg-[var(--color-surface-mid)] text-[var(--color-muted)]";
    case "CHAT_MESSAGE": return "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]";
    default: return "bg-[var(--color-surface-mid)] text-[var(--color-muted)]";
  }
}

function getTypeLabelColor(type: string) {
  switch (type) {
    case "MEETING_SCHEDULED":
    case "MEETING_UPDATED":
    case "MEETING_CANCELED": return "text-[var(--color-secondary)]";
    case "ANNOUNCEMENT_POSTED": return "text-[var(--color-warning)]";
    case "NOTE_SHARED": return "text-[var(--color-success)]";
    case "CHAT_MESSAGE": return "text-[var(--color-secondary)]";
    default: return "text-[var(--color-muted)]";
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "MEETING_SCHEDULED":
    case "MEETING_UPDATED":
    case "MEETING_CANCELED":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case "ANNOUNCEMENT_POSTED":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "NOTE_SHARED":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "FILE_SHARED":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13,2 13,9 20,9" /></svg>;
    case "CHAT_MESSAGE":
      return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    default:
      return <BellIcon />;
  }
}

function BellIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
}

// ── Time ─────────────────────────────────────────────────────────────────────

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
