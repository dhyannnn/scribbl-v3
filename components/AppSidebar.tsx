import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  getSharedStorageLimitBytes,
  getPrivateStorageLimitPerUserBytes,
} from "@/lib/billing";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Workspaces",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/account",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      </svg>
    ),
  },
];

type AppSidebarProps = {
  activePath?: string;
};

export async function AppSidebar({ activePath = "/" }: AppSidebarProps) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser?.id ?? "";

  const memberships = currentUser
    ? await prisma.workspaceMember.findMany({
        where: { userId: currentUser.id, status: "ACTIVE" },
        select: {
          role: true,
          createdAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              plan: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const workspaceIds = memberships.map((m) => m.workspace.id);
  const adminWorkspaceIds = memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.workspace.id);
  const memberWorkspaceIds = memberships
    .filter((m) => m.role === "MEMBER")
    .map((m) => m.workspace.id);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayDateParam = todayStart.toISOString().slice(0, 10);

  const visibleMeetingScope = [
    ...(adminWorkspaceIds.length > 0
      ? [{ workspaceId: { in: adminWorkspaceIds } }]
      : []),
    ...(memberWorkspaceIds.length > 0
      ? [{
          workspaceId: { in: memberWorkspaceIds },
          OR: [
            { groupId: null },
            { group: { members: { some: { userId: currentUserId } } } },
          ],
        }]
      : []),
  ];

  const [nextMeeting, todayMeetingCount, [sharedStorageRows, privateStorageRows]] = workspaceIds.length > 0
    ? await Promise.all([
        prisma.meeting.findFirst({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            startsAt: { gte: new Date() },
            OR: visibleMeetingScope,
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            title: true,
            startsAt: true,
            workspaceId: true,
            workspace: { select: { name: true } },
          },
        }),
        prisma.meeting.count({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            startsAt: { gte: todayStart, lt: todayEnd },
            OR: visibleMeetingScope,
          },
        }),
        // Owners/admins see shared storage; members see their own private storage
        Promise.all([
          adminWorkspaceIds.length > 0
            ? prisma.file.groupBy({
                by: ["workspaceId"],
                where: { workspaceId: { in: adminWorkspaceIds }, visibility: "WORKSPACE_SHARED" },
                _sum: { sizeBytes: true },
              })
            : Promise.resolve([]),
          memberWorkspaceIds.length > 0
            ? prisma.file.groupBy({
                by: ["workspaceId"],
                where: {
                  workspaceId: { in: memberWorkspaceIds },
                  uploadedByUserId: currentUserId,
                  visibility: "PRIVATE",
                },
                _sum: { sizeBytes: true },
              })
            : Promise.resolve([]),
        ]),
      ])
    : [null, 0, [[], []]];

  const sharedByWorkspace = new Map(
    sharedStorageRows.map((row) => [row.workspaceId, row._sum.sizeBytes ?? 0])
  );
  const privateByWorkspace = new Map(
    privateStorageRows.map((row) => [row.workspaceId, row._sum.sizeBytes ?? 0])
  );

  const storageSnapshots = memberships
    .map((membership) => {
      const isAdminOrOwner = membership.role === "OWNER" || membership.role === "ADMIN";
      const storageBytes = isAdminOrOwner
        ? (sharedByWorkspace.get(membership.workspace.id) ?? 0)
        : (privateByWorkspace.get(membership.workspace.id) ?? 0);
      const storageLimitBytes = isAdminOrOwner
        ? getSharedStorageLimitBytes(membership.workspace.plan)
        : getPrivateStorageLimitPerUserBytes(membership.workspace.plan);
      const storagePercent = storageLimitBytes > 0
        ? Math.min(100, Math.round((storageBytes / storageLimitBytes) * 100))
        : 0;

      return {
        id: membership.workspace.id,
        name: membership.workspace.name,
        isAdminOrOwner,
        storageBytes,
        storageLimitBytes,
        storagePercent,
      };
    })
    .sort((a, b) => b.storageBytes - a.storageBytes);
  const visibleStorageSnapshots = storageSnapshots.slice(0, 4);
  const hiddenStorageCount = Math.max(0, storageSnapshots.length - visibleStorageSnapshots.length);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-[var(--color-border)] px-5">
        <Link href="/" className="flex items-center">
          <div className="rounded-full bg-white px-3 py-1.5 shadow-sm">
            <img src="/scribbl-logo.png" alt="Scribbl" className="h-9 w-auto object-contain" />
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Search */}
        <form action="/search" method="GET" className="mb-4">
          <label className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-3.5 text-[var(--color-subtle)]"
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              name="q"
              type="search"
              placeholder="Search…"
              className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] pl-9 pr-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)] placeholder:text-[var(--color-subtle)]"
            />
          </label>
        </form>

        {workspaceIds.length > 0 ? (
          <div className="mb-4 grid gap-3">
            <Link
              href={`/calendar?view=day&date=${todayDateParam}`}
              className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-4 transition hover:border-[var(--color-secondary)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
                  Today
                </p>
                <span className="font-display text-xl font-bold text-[var(--color-text)]">
                  {todayMeetingCount}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {todayMeetingCount === 1 ? "session scheduled" : "sessions scheduled"}
              </p>
            </Link>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
                  Storage
                </p>
                <span className="text-xs font-bold text-[var(--color-muted)]">
                  per workspace
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {visibleStorageSnapshots.map((snapshot) => (
                  <Link
                    key={snapshot.id}
                    href={`/workspaces/${snapshot.id}/files`}
                    className="block rounded-xl p-1.5 transition hover:bg-[var(--color-surface-low)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-[var(--color-text)]">
                        {snapshot.name}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-[var(--color-muted)]">
                        {snapshot.storagePercent}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-mid)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-secondary)]"
                        style={{ width: `${snapshot.storagePercent}%` }}
                      />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[var(--color-muted)]">
                      {formatBytes(snapshot.storageBytes)} of {formatBytes(snapshot.storageLimitBytes)}{" "}
                      <span className="opacity-60">({snapshot.isAdminOrOwner ? "shared" : "private"})</span>
                    </p>
                  </Link>
                ))}
              </div>
              {hiddenStorageCount > 0 ? (
                <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                  +{hiddenStorageCount} more {hiddenStorageCount === 1 ? "workspace" : "workspaces"}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {nextMeeting ? (
          <Link
            href={nextMeeting.workspaceId ? `/workspaces/${nextMeeting.workspaceId}/meetings/${nextMeeting.id}` : "/"}
            className="mb-4 block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-4 transition hover:border-[var(--color-secondary)]"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
              Up next
            </p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-[var(--color-text)]">
              {nextMeeting.title}
            </p>
            <p className="mt-1 truncate text-xs text-[var(--color-muted)]">
              {nextMeeting.workspace?.name ?? "Workspace"}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--color-muted)]">
                <LocalTime date={nextMeeting.startsAt} short />
              </span>
              <span className="text-xs font-bold text-[var(--color-secondary)]">Open</span>
            </div>
          </Link>
        ) : null}

        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-[var(--color-secondary)] text-white"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + plan */}
      <div className="border-t border-[var(--color-border)] p-4">
        <div className="mb-2 space-y-0.5">
          <Link
            href="/help"
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help & Docs
          </Link>
          <ThemeToggle initialDark={currentUser?.darkMode ?? false} />
        </div>
        {currentUser ? (
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-[var(--color-surface-mid)]"
          >
            <UserAvatar name={currentUser.displayName} avatarUrl={currentUser.avatarUrl} sizeClassName="h-8 w-8" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{currentUser.displayName}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{currentUser.email}</p>
            </div>
          </Link>
        ) : null}
      </div>
      </aside>
      <MobileAppNav activePath={activePath} currentUser={currentUser} />
    </>
  );
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex < 2 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function MobileAppNav({
  activePath,
  currentUser,
}: {
  activePath: string;
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>;
}) {
  const mobileItems = navItems.filter((item) =>
    ["Dashboard", "Calendar", "Notifications", "Settings"].includes(item.label)
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 lg:hidden">
        <Link href="/" className="flex min-w-0 items-center">
          <div className="rounded-full bg-white px-3 py-1.5 shadow-sm">
            <img src="/scribbl-logo.png" alt="Scribbl" className="h-9 w-auto object-contain" />
          </div>
        </Link>
        {currentUser ? (
          <Link
            href="/account"
            aria-label="Account"
          >
            <UserAvatar name={currentUser.displayName} avatarUrl={currentUser.avatarUrl} sizeClassName="h-9 w-9" />
          </Link>
        ) : null}
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 lg:hidden">
        <ul className="grid grid-cols-4 gap-1">
          {mobileItems.map((item) => {
            const isActive = activePath === item.href;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition ${
                    isActive
                      ? "bg-[var(--color-secondary)] text-white"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="scale-90">{item.icon}</span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function UserAvatar({
  avatarUrl,
  name,
  sizeClassName,
}: {
  avatarUrl?: string | null;
  name: string;
  sizeClassName: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={`${sizeClassName} shrink-0 rounded-full object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className={`${sizeClassName} flex shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-white`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
