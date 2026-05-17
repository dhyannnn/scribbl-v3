import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { NavLink } from "@/components/NavLink";

type WorkspaceSidebarProps = {
  workspaceId: string;
};

export async function WorkspaceSidebar({ workspaceId }: WorkspaceSidebarProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      plan: true,
      members: {
        where: { userId: currentUser.id, status: "ACTIVE" },
        select: { role: true },
        take: 1,
      },
      channels: {
        where: {
          OR: [
            { meetingId: null },
            { meetingId: { not: null }, type: "CHAT", meeting: { canceledAt: null } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          meetingId: true,
          meeting: {
            select: { title: true, startsAt: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!workspace) return null;

  const membership = workspace.members[0];
  const canManage = membership?.role === "OWNER" || membership?.role === "ADMIN";

  const announcementChannels = workspace.channels.filter((c) => !c.meetingId && c.type === "ANNOUNCEMENT");
  const workspaceChannels = workspace.channels.filter((c) => !c.meetingId && c.type !== "ANNOUNCEMENT");
  // Show most recent 15 meeting channels, sorted newest first
  const meetingChannels = workspace.channels
    .filter((c) => c.meetingId)
    .sort((a, b) => (b.meeting?.startsAt?.getTime() ?? 0) - (a.meeting?.startsAt?.getTime() ?? 0))
    .slice(0, 15);

  const pageNav = [
    { label: "Home", href: `/workspaces/${workspaceId}`, page: "home" as const },
    { label: "Notes", href: `/workspaces/${workspaceId}/notes`, page: "notes" as const },
    { label: "Calendar", href: `/workspaces/${workspaceId}/calendar`, page: "calendar" as const },
    { label: "Meetings", href: `/workspaces/${workspaceId}/meetings`, page: "meetings" as const },
    { label: "Files", href: `/workspaces/${workspaceId}/files`, page: "files" as const },
    ...(workspace.plan !== "FREE"
      ? [{ label: "Groups", href: `/workspaces/${workspaceId}/groups`, page: "groups" as const }]
      : []),
    { label: "Members", href: `/workspaces/${workspaceId}/members`, page: "members" as const },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Logo + workspace name */}
      <div className="flex h-16 items-center gap-3 border-b border-[var(--color-border)] px-5">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <span className="font-display text-base font-bold text-[var(--color-text)] tracking-tight truncate">
            {workspace.name}
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* New session CTA */}
        <div className="px-3 pt-4 pb-2">
          <Link
            href={`/workspaces/${workspaceId}/meetings`}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-secondary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            New Session
          </Link>
        </div>

        {/* Back to dashboard */}
        <div className="px-3 pb-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Dashboard
          </Link>
        </div>

        {/* Workspace pages */}
        <div className="px-3 pb-2">
          <p className="mb-1 px-4 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
            Workspace
          </p>
          <ul className="space-y-0.5">
            {pageNav.map((item) => (
              <li key={item.page}>
                <NavLink
                  href={item.href}
                  exact={item.page === "home"}
                  activeClassName="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white"
                  inactiveClassName="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {/* Announcements */}
        {announcementChannels.length > 0 ? (
          <div className="px-3 pb-2">
            <ul className="space-y-0.5">
              {announcementChannels.map((channel) => (
                <li key={channel.id}>
                  <NavLink
                    href={`/workspaces/${workspaceId}/chat/${channel.id}`}
                    exact
                    activeClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white"
                    inactiveClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
                      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
                    </svg>
                    <span className="truncate">Announcements</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Workspace channels */}
        {workspaceChannels.length > 0 ? (
          <div className="px-3 pb-2">
            <p className="mb-1 px-4 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Channels
            </p>
            <ul className="space-y-0.5">
              {workspaceChannels.map((channel) => (
                <li key={channel.id}>
                  <NavLink
                    href={`/workspaces/${workspaceId}/chat/${channel.id}`}
                    exact
                    activeClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white"
                    inactiveClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition"
                  >
                    <span className="shrink-0 font-mono text-xs opacity-60">#</span>
                    <span className="truncate">{channel.name}</span>
                  </NavLink>
                </li>
              ))}
              {canManage ? (
                <li>
                  <Link
                    href={`/workspaces/${workspaceId}/chat`}
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-muted)]"
                  >
                    <span className="shrink-0 text-base leading-none">+</span>
                    <span>Add channel</span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {/* Meeting chats */}
        {meetingChannels.length > 0 ? (
          <div className="px-3 pb-4">
            <p className="mb-1 px-4 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Meeting Chats
            </p>
            <ul className="space-y-0.5">
              {meetingChannels.map((channel) => (
                <li key={channel.id}>
                  <NavLink
                    href={`/workspaces/${workspaceId}/chat/${channel.id}`}
                    exact
                    activeClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white"
                    inactiveClassName="flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <span className="truncate">
                      {channel.meeting?.title ?? channel.name}
                    </span>
                    {channel.meeting?.startsAt ? (
                      <span className="ml-auto shrink-0 font-mono text-xs opacity-50">
                        {channel.meeting.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* User */}
      <div className="border-t border-[var(--color-border)] p-4">
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-[var(--color-surface-mid)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-white">
            {currentUser.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">{currentUser.displayName}</p>
            <p className="truncate text-xs text-[var(--color-muted)]">{currentUser.email}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
