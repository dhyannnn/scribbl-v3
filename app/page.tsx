import Link from "next/link";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scribbl — Collaborative Workspaces for Teams & Students",
  description: "Scribbl is an all-in-one collaborative workspace — notes, whiteboards, meetings, chat, and files in one place. Built for teams, students, and classrooms.",
  alternates: {
    canonical: "https://scribblapp.ca",
  },
};
import { LocalTime } from "@/components/LocalTime";
import { LandingPage } from "@/components/LandingPage";
import { AppSidebar } from "@/components/AppSidebar";
import { getCurrentUser } from "@/lib/current-user";
import { getWorkspaceActivity } from "@/lib/activity";
import { getMeetingLifecycle, canJoinMeeting } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import { getGradient, getInitials } from "@/lib/color-hash";
import { createWorkspace } from "./actions";
import { acceptWorkspaceInvite } from "./invites/actions";
import { signOut } from "./auth/actions";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Scribbl",
            url: "https://scribblapp.ca",
            description: "All-in-one collaborative workspace — notes, whiteboards, meetings, chat, and files in one place.",
            applicationCategory: "ProductivityApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "CAD",
            },
          }),
        }}
      />
      <LandingPage />
    </>
  );

  const { workspace: workspaceStatus } = await searchParams;
  const now = new Date();
  const fallbackLiveStartsAt = new Date(now.getTime() - 60 * 60 * 1000);

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      displayName: true,
      avatarUrl: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
              plan: true,
              description: true,
              _count: {
                select: {
                  members: { where: { status: "ACTIVE" } },
                },
              },
            },
          },
        },
      },
    },
  });

  const workspaces = user?.memberships.map((m) => m.workspace) ?? [];
  const workspaceIds = workspaces.map((w) => w.id);
  const adminWorkspaceIds = user?.memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.workspace.id) ?? [];
  const memberWorkspaceIds = user?.memberships
    .filter((m) => m.role === "MEMBER")
    .map((m) => m.workspace.id) ?? [];

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [pendingInvites, upcomingMeetings, activity, calendarMeetings] = await Promise.all([
    prisma.workspaceInvite.findMany({
      where: {
        email: currentUser.email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        workspace: { select: { name: true } },
        invitedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    workspaceIds.length > 0
      ? prisma.meeting.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            OR: [
              { startsAt: { gte: fallbackLiveStartsAt }, endsAt: null },
              { endsAt: { gte: now } },
            ],
            AND: [
              {
                OR: [
                  ...(adminWorkspaceIds.length > 0
                    ? [{ workspaceId: { in: adminWorkspaceIds } }]
                    : []),
                  ...(memberWorkspaceIds.length > 0
                    ? [{
                        workspaceId: { in: memberWorkspaceIds },
                        OR: [
                          { groupId: null },
                          { group: { members: { some: { userId: currentUser.id } } } },
                        ],
                      }]
                    : []),
                ],
              },
            ],
          },
          select: {
            id: true,
            workspaceId: true,
            title: true,
            description: true,
            startsAt: true,
            endsAt: true,
            canceledAt: true,
            workspace: { select: { name: true } },
            participants: {
              where: { user: { deletedAt: null } },
              select: { userId: true, user: { select: { displayName: true, avatarUrl: true } } },
              take: 5,
            },
          },
          orderBy: { startsAt: "asc" },
          take: 5,
        })
      : [],
    getWorkspaceActivity(workspaceIds, 8),
    workspaceIds.length > 0
      ? prisma.meeting.findMany({
          where: {
            workspaceId: { in: workspaceIds },
            canceledAt: null,
            startsAt: { gte: monthStart, lte: monthEnd },
          },
          select: { startsAt: true },
        })
      : [],
  ]);

  const liveOrNext = upcomingMeetings[0] ?? null;
  const datesWithMeetings = new Set(
    calendarMeetings.map((m) => m.startsAt.toISOString().slice(0, 10))
  );
  const continueActivity = activity[0] ?? null;
  const heroLifecycle = liveOrNext ? getMeetingLifecycle(liveOrNext, now) : null;
  const isHeroLive = heroLifecycle ? canJoinMeeting(heroLifecycle) : false;

  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <AppSidebar activePath="/" />

      <main className="min-w-0 flex-1 pb-24 pt-16 lg:pb-0 lg:pt-0 lg:pl-64">
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">

          {/* Welcome header */}
          <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-xs font-medium uppercase tracking-widest text-[var(--color-subtle)]">
                {today}
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
                Welcome back, {currentUser.displayName.split(" ")[0]}.
              </h1>
            </div>
            <div className="mt-4 flex items-center gap-3 sm:mt-0">
              {workspaces.length > 0 ? (
                <Link
                  href="/new/session"
                  className="flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                  New Session
                </Link>
              ) : null}
              <form action={signOut}>
                <button className="rounded-full border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]">
                  Sign out
                </button>
              </form>
            </div>
          </div>

          {/* Pending invites */}
          {pendingInvites.length > 0 ? (
            <section className="mb-8 rounded-2xl border border-[var(--color-secondary-dim)] bg-[var(--color-surface-low)] p-5">
              <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-text)]">
                Invitations ({pendingInvites.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-text)]">{invite.workspace.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {invite.role.toLowerCase()} · invited by {invite.invitedBy.displayName}
                      </p>
                    </div>
                    <form action={acceptWorkspaceInvite}>
                      <input type="hidden" name="token" value={invite.token} />
                      <button className="shrink-0 rounded-full bg-[var(--color-secondary)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]">
                        Accept
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Workspace status banners */}
          {workspaceStatus === "plan-limit" ? (
            <div className="mb-8 rounded-xl border border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] px-5 py-4 text-sm text-[var(--color-warning)]">
              Free plan allows 1 workspace.{" "}
              <Link href="/pricing" className="font-semibold underline">Upgrade to Pro</Link> for unlimited workspaces.
            </div>
          ) : workspaceStatus === "deleted" ? (
            <div className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm text-[var(--color-muted)]">
              Workspace deleted successfully.
            </div>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            {/* Left column */}
            <div className="flex min-w-0 flex-col gap-8">

              {/* Hero meeting card */}
              {liveOrNext ? (
                <section>
                  <Link
                    href={`/workspaces/${liveOrNext.workspaceId}/meetings/${liveOrNext.id}`}
                    className="block rounded-2xl bg-[var(--color-live)] p-6 text-white transition hover:opacity-95"
                  >
                    <div className="flex items-center gap-2">
                      {isHeroLive ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-red-400">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                          Live now
                        </span>
                      ) : (
                        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-secondary-dim)]">
                          {liveOrNext.workspace?.name ?? ""}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 font-display text-2xl font-bold lg:text-3xl">{liveOrNext.title}</h2>
                    {liveOrNext.description ? (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">{liveOrNext.description}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {/* Participant avatars */}
                        <div className="flex -space-x-2">
                          {liveOrNext.participants.slice(0, 4).map((p) => (
                            <div
                              key={p.userId}
                              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--color-live)] bg-[var(--color-secondary)] text-xs font-bold text-white"
                            >
                              {p.user.displayName.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {liveOrNext.participants.length > 4 ? (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--color-live)] bg-slate-600 text-xs font-bold text-white">
                              +{liveOrNext.participants.length - 4}
                            </div>
                          ) : null}
                        </div>
                        <span className="text-sm text-slate-300">
                          {liveOrNext.participants.length} participant{liveOrNext.participants.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className="rounded-full bg-[var(--color-secondary)] px-5 py-2 text-sm font-semibold text-white">
                        {isHeroLive ? "Join session" : <LocalTime date={liveOrNext.startsAt} short />}
                      </span>
                    </div>
                  </Link>
                </section>
              ) : null}

              {/* Workspaces */}
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-[var(--color-text)]">Your Workspaces</h2>
                  <span className="font-mono text-xs text-[var(--color-subtle)]">{workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {workspaces.map((workspace) => {
                    const [gradFrom, gradTo] = getGradient(workspace.name);
                    const initials = getInitials(workspace.name);
                    return (
                    <Link
                      key={workspace.id}
                      href={`/workspaces/${workspace.id}`}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:-translate-y-0.5 hover:border-[var(--color-secondary)] hover:shadow-md"
                    >
                      {/* Gradient header with initials */}
                      <div
                        className="flex h-16 w-full items-end px-5 pb-3"
                        style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
                      >
                        <div
                          className="flex size-10 items-center justify-center rounded-xl border-2 border-white/30 text-sm font-bold text-white"
                          style={{ background: "rgba(255,255,255,0.18)" }}
                        >
                          {initials}
                        </div>
                      </div>
                      {/* Card content */}
                      <div className="flex flex-col p-5">
                      {workspace.plan !== "FREE" ? (
                        <span className="absolute right-4 top-4 rounded-full bg-white/25 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">
                          {workspace.plan === "INSTITUTION" ? "Institution" : "Pro"}
                        </span>
                      ) : null}
                      <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                        {workspace.type.replace("_", " ").toLowerCase()}
                      </p>
                      <h3 className="mt-1 font-display text-lg font-semibold text-[var(--color-text)]">{workspace.name}</h3>
                      {workspace.description ? (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[var(--color-muted)]">
                          {workspace.description}
                        </p>
                      ) : null}
                      <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-subtle)]">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="text-xs text-[var(--color-subtle)]">
                          {workspace._count.members} member{workspace._count.members !== 1 ? "s" : ""}
                        </span>
                      </div>
                      </div>{/* end card content */}
                    </Link>
                    );
                  })}

                  {/* Create workspace card */}
                  <details className="group rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]">
                    <summary className="flex cursor-pointer list-none items-center justify-center gap-2 p-5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      Create Workspace
                    </summary>
                    <form action={createWorkspace} className="border-t border-[var(--color-border)] px-5 pb-5 pt-4">
                      <div className="grid gap-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--color-muted)]">Workspace name</span>
                          <input
                            name="name"
                            required
                            placeholder="Marketing Q3, Engineering, BIO 101..."
                            className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--color-muted)]">Type</span>
                          <select
                            name="type"
                            defaultValue="TEAM"
                            className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                          >
                            <option value="TEAM">Team</option>
                            <option value="PROJECT">Project</option>
                            <option value="CLASS">Class</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-[var(--color-muted)]">Description</span>
                          <textarea
                            name="description"
                            rows={2}
                            placeholder="What will people use this workspace for?"
                            className="resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                          />
                        </label>
                        <button className="rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-80">
                          Create
                        </button>
                      </div>
                    </form>
                  </details>
                </div>
              </section>

              {workspaces.length > 0 ? (
                <section aria-label="Quick actions" className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-3">
                    <QuickActionLink
                      href="/new/note"
                      icon="note"
                      label="New Note"
                    />
                    <QuickActionLink
                      href={continueActivity?.href ?? "/notifications"}
                      icon={continueActivity?.icon ?? "activity"}
                      label="Continue"
                    />
                    <QuickActionLink
                      href="/new/file"
                      icon="file"
                      label="Upload File"
                    />
                  </div>
                </section>
              ) : null}
            </div>

            {/* Right column — activity feed */}
            <aside className="flex flex-col gap-6">

              {/* Mini calendar */}
              {workspaces.length > 0 ? (
                <MiniCalendar
                  year={now.getFullYear()}
                  month={now.getMonth()}
                  today={now}
                  datesWithMeetings={datesWithMeetings}
                  calendarHref="/calendar"
                />
              ) : null}

              {/* Upcoming meetings list */}
              {upcomingMeetings.length > 1 ? (
                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <h2 className="mb-4 font-display text-base font-semibold text-[var(--color-text)]">Upcoming</h2>
                  <div className="flex flex-col divide-y divide-[var(--color-border)]">
                    {upcomingMeetings.slice(1).map((meeting) => (
                      <Link
                        key={meeting.id}
                        href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`}
                        className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 hover:text-[var(--color-secondary)]"
                      >
                        <p className="font-mono text-xs text-[var(--color-subtle)]">{meeting.workspace?.name ?? ""}</p>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{meeting.title}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          <LocalTime date={meeting.startsAt} short />
                        </p>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Activity feed */}
              <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Recent Activity</h2>
                  <Link href="/" className="shrink-0 font-mono text-xs font-semibold text-[var(--color-secondary)] hover:underline">
                    View all
                  </Link>
                </div>
                {activity.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {activity.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="flex items-start gap-3 hover:opacity-80"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-mid)]">
                          <ActivityIcon icon={item.icon} />
                        </div>
                        <div className="min-w-0">
                          <p className="line-clamp-2 break-words text-sm text-[var(--color-text)]">{item.label}</p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
                            {formatRelativeTime(item.createdAt, now)}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Activity from your workspaces will appear here.
                  </p>
                )}
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function QuickActionLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: "activity" | "billing" | "file" | "group" | "meeting" | "member" | "note" | "recording";
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
    >
      <QuickActionIcon icon={icon} />
      <span>{label}</span>
    </Link>
  );
}

function QuickActionIcon({ icon }: { icon: "activity" | "billing" | "file" | "group" | "meeting" | "member" | "note" | "recording" }) {
  const cls = "shrink-0";
  switch (icon) {
    case "activity":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "billing":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case "meeting":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      );
    case "file":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "group":
    case "member":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "recording":
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
  }
}

function MiniCalendar({
  year, month, today, datesWithMeetings, calendarHref,
}: {
  year: number;
  month: number;
  today: Date;
  datesWithMeetings: Set<string>;
  calendarHref: string;
}) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last week
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = firstDay.toLocaleString("en-US", { month: "long", year: "numeric" });
  const todayDate = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-[var(--color-text)]">{monthLabel}</h2>
        <Link
          href={calendarHref}
          className="font-mono text-xs text-[var(--color-secondary)] hover:underline"
        >
          Open →
        </Link>
      </div>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="py-0.5 text-center font-mono text-[10px] font-semibold uppercase text-[var(--color-subtle)]">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = day === todayDate && month === todayMonth && year === todayYear;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasMeeting = datesWithMeetings.has(dateStr);

          return (
            <Link
              key={i}
              href={`${calendarHref}?view=day&date=${dateStr}`}
              className="flex flex-col items-center py-0.5"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs transition hover:bg-[var(--color-surface-mid)] ${
                isToday
                  ? "bg-[var(--color-secondary)] font-semibold text-white"
                  : "text-[var(--color-text)]"
              }`}>
                {day}
              </span>
              {hasMeeting ? (
                <span className={`mt-0.5 h-1 w-1 rounded-full ${isToday ? "bg-white" : "bg-[var(--color-secondary)]"}`} />
              ) : (
                <span className="mt-0.5 h-1 w-1" />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ActivityIcon({ icon }: { icon: string }) {
  const cls = "text-[var(--color-muted)]";
  switch (icon) {
    case "meeting":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>;
    case "note":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case "file":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>;
    case "member":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>;
    case "recording":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>;
    case "group":
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    default:
      return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
  }
}

function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
