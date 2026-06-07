import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { NavLink } from "@/components/NavLink";
import { StatusPickerAvatar } from "@/components/StatusPickerAvatar";
import { NewDmButton } from "@/components/NewDmButton";
import { DeleteDmButton } from "@/components/DeleteDmButton";

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
            { meetingId: null, type: { not: "DIRECT" } },
            { meetingId: { not: null }, type: "CHAT", meeting: { canceledAt: null } },
            { type: "DIRECT", OR: [{ dmUser1Id: currentUser.id }, { dmUser2Id: currentUser.id }] },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          meetingId: true,
          dmUser1Id: true,
          dmUser2Id: true,
          dmUser1: { select: { id: true, displayName: true, avatarUrl: true } },
          dmUser2: { select: { id: true, displayName: true, avatarUrl: true } },
          meeting: { select: { title: true, startsAt: true } },
          seriesMeetings: { select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!workspace) return null;

  const membership = workspace.members[0];
  const canManage = membership?.role === "OWNER" || membership?.role === "ADMIN";

  const announcementChannels = workspace.channels.filter((c) => !c.meetingId && c.type === "ANNOUNCEMENT");
  // Series channels have no meetingId but have seriesMeetings — keep them out of regular channels
  const seriesChannelIds = new Set(
    workspace.channels.filter((c) => c.seriesMeetings.length > 0).map((c) => c.id),
  );
  const workspaceChannels = workspace.channels.filter(
    (c) => !c.meetingId && c.type === "CHAT" && !seriesChannelIds.has(c.id),
  );
  const dmChannels = workspace.channels.filter((c) => c.type === "DIRECT");
  const meetingChannels = workspace.channels
    .filter((c) => c.meetingId)
    .sort((a, b) => (b.meeting?.startsAt?.getTime() ?? 0) - (a.meeting?.startsAt?.getTime() ?? 0))
    .slice(0, 15);
  const seriesChannels = workspace.channels.filter((c) => seriesChannelIds.has(c.id));

  // Unread indicators
  const channelIds = workspace.channels.map((c) => c.id);
  const [lastReads, latestMessages, dmMembers] = await Promise.all([
    channelIds.length > 0
      ? prisma.channelLastRead.findMany({
          where: { userId: currentUser.id, channelId: { in: channelIds } },
          select: { channelId: true, readAt: true },
        })
      : Promise.resolve([]),
    channelIds.length > 0
      ? prisma.message.groupBy({
          by: ["channelId"],
          where: { channelId: { in: channelIds }, deletedAt: null },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: "ACTIVE", userId: { not: currentUser.id } },
      select: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const lastReadMap = new Map(lastReads.map((lr) => [lr.channelId, lr.readAt]));
  const latestMsgMap = new Map(latestMessages.map((lm) => [lm.channelId, lm._max.createdAt]));

  const unreadChannelIds = new Set<string>();
  for (const id of channelIds) {
    const latest = latestMsgMap.get(id);
    if (!latest) continue;
    const lastRead = lastReadMap.get(id);
    if (!lastRead || latest > lastRead) {
      unreadChannelIds.add(id);
    }
  }

  const pageNav = [
    { label: "Home", href: `/workspaces/${workspaceId}`, page: "home" as const },
    { label: "Notes", href: `/workspaces/${workspaceId}/notes`, page: "notes" as const },
    { label: "Calendar", href: `/workspaces/${workspaceId}/calendar`, page: "calendar" as const },
    { label: "Meetings", href: `/workspaces/${workspaceId}/meetings`, page: "meetings" as const },
    { label: "Calls", href: `/workspaces/${workspaceId}/calls`, page: "calls" as const },
    { label: "Files", href: `/workspaces/${workspaceId}/files`, page: "files" as const },
    ...(workspace.plan !== "FREE"
      ? [{ label: "Groups", href: `/workspaces/${workspaceId}/groups`, page: "groups" as const }]
      : []),
    { label: "Members", href: `/workspaces/${workspaceId}/members`, page: "members" as const },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
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
                    {unreadChannelIds.has(channel.id) ? (
                      <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                    ) : null}
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
                    {unreadChannelIds.has(channel.id) ? (
                      <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                    ) : null}
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

        {/* Direct Messages — always visible */}
        <div className="px-3 pb-2">
          <div className="mb-1 flex items-center justify-between px-4">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Direct Messages
            </p>
            <NewDmButton
              workspaceId={workspaceId}
              members={dmMembers
                .map((m) => m.user)
                .filter((m) => !dmChannels.some(
                  (c) => c.dmUser1Id === m.id || c.dmUser2Id === m.id
                ))}
            />
          </div>
          <ul className="space-y-0.5">
            {dmChannels.map((channel) => {
              const other = channel.dmUser1Id === currentUser.id ? channel.dmUser2 : channel.dmUser1;
              const initials = other?.displayName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?";
              return (
                <li key={channel.id} className="group/dm relative">
                  <NavLink
                    href={`/workspaces/${workspaceId}/chat/${channel.id}`}
                    exact
                    activeClassName="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white pr-8"
                    inactiveClassName="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition pr-8"
                  >
                    {other?.avatarUrl ? (
                      <img src={other.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-high)] text-[9px] font-bold text-[var(--color-muted)]">
                        {initials}
                      </span>
                    )}
                    <span className="truncate">{other?.displayName ?? "Unknown"}</span>
                    {unreadChannelIds.has(channel.id) ? (
                      <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                    ) : null}
                  </NavLink>
                  <DeleteDmButton
                    channelId={channel.id}
                    workspaceId={workspaceId}
                    otherUserName={other?.displayName ?? "this person"}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {/* Series chats — one channel per recurring meeting series */}
        {seriesChannels.length > 0 ? (
          <div className="px-3 pb-2">
            <p className="mb-1 px-4 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Recurring Chats
            </p>
            <ul className="space-y-0.5">
              {seriesChannels.map((channel) => (
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
                      {channel.name.replace(/^Meeting:\s*/i, "")}
                    </span>
                    {unreadChannelIds.has(channel.id) ? (
                      <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                    ) : null}
                  </NavLink>
                </li>
              ))}
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
                    {unreadChannelIds.has(channel.id) ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Billing link — owner only */}
      {membership?.role === "OWNER" ? (
        <div className="border-t border-[var(--color-border)] px-3 py-2">
          <NavLink
            href={`/workspaces/${workspaceId}/billing`}
            exact
            activeClassName="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium bg-[var(--color-secondary)] text-white"
            inactiveClassName="flex items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Billing
          </NavLink>
        </div>
      ) : null}

      {/* User */}
      <div className="border-t border-[var(--color-border)] p-4">
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5">
            <StatusPickerAvatar
              initialStatus={currentUser.status}
              name={currentUser.displayName}
              avatarUrl={currentUser.avatarUrl}
              sizeClassName="h-8 w-8"
            />
            <Link href={`/profile/${currentUser.id}`} className="min-w-0 flex-1 transition hover:opacity-75">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{currentUser.displayName}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{currentUser.email}</p>
            </Link>
          </div>
          <Link
            href="/account"
            title="Account settings"
            className="shrink-0 rounded-full p-1.5 text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      </div>
    </aside>
  );
}
