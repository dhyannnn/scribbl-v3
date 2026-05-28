import Link from "next/link";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

type CalendarView = "month" | "week" | "day" | "agenda";

type PageProps = {
  searchParams: Promise<{ view?: string; date?: string }>;
};

// ── Date utilities ─────────────────────────────────────────────────────────────

function parseDate(raw: string | undefined): Date {
  if (raw) {
    const d = new Date(raw + "T00:00:00");
    if (!isNaN(d.getTime())) return d;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toDateParam(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7;
  return addDays(d, -dow);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getMonthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function getWeekDays(anchor: Date): Date[] {
  const monday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function getQueryRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  switch (view) {
    case "month": {
      const days = getMonthGridDays(anchor.getFullYear(), anchor.getMonth());
      const start = new Date(days[0]);
      const end = new Date(days[days.length - 1]);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "week": {
      const days = getWeekDays(anchor);
      const start = new Date(days[0]);
      const end = new Date(days[6]);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "day": {
      const start = new Date(anchor);
      const end = new Date(anchor);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case "agenda": {
      const start = new Date(anchor);
      const end = addDays(anchor, 60);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
}

function getNavUrls(view: CalendarView, anchor: Date) {
  const base = "/calendar";
  function url(d: Date) {
    return `${base}?view=${view}&date=${toDateParam(d)}`;
  }

  let prev: Date, next: Date;
  switch (view) {
    case "month": prev = addMonths(anchor, -1); next = addMonths(anchor, 1); break;
    case "week":  prev = addDays(anchor, -7);   next = addDays(anchor, 7);   break;
    case "day":   prev = addDays(anchor, -1);   next = addDays(anchor, 1);   break;
    case "agenda": prev = addDays(anchor, -14); next = addDays(anchor, 14);  break;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    prev: url(prev),
    next: url(next),
    today: url(today),
    switchView: (v: CalendarView) => `${base}?view=${v}&date=${toDateParam(anchor)}`,
    day: (d: Date) => `${base}?view=day&date=${toDateParam(d)}`,
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

type CalMeeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  canceledAt: Date | null;
  workspaceId: string;
  workspaceName: string;
  myRsvp: string | null;
};

type CalLifecycle = "live" | "upcoming" | "ended" | "canceled";

function getCalLifecycle(m: CalMeeting, now: Date): CalLifecycle {
  if (m.canceledAt) return "canceled";
  const lc = getMeetingLifecycle(m, now);
  if (lc === "live" || lc === "joinable" || lc === "starting-soon") return "live";
  if (lc === "ended") return "ended";
  return "upcoming";
}

function groupByDay(meetings: CalMeeting[]): Map<string, CalMeeting[]> {
  const map = new Map<string, CalMeeting[]>();
  for (const m of meetings) {
    const key = toDateParam(m.startsAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function GlobalCalendarPage({ searchParams }: PageProps) {
  const { view: viewRaw, date: dateRaw } = await searchParams;

  const view: CalendarView =
    viewRaw === "week" || viewRaw === "day" || viewRaw === "agenda" ? viewRaw : "month";

  const anchor = parseDate(dateRaw);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();

  const currentUser = await getCurrentUser();
  if (!currentUser) return <ProtectedPageMessage />;

  // Get all active workspace memberships
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: currentUser.id, status: "ACTIVE" },
    select: { workspaceId: true, workspace: { select: { id: true, name: true } } },
  });

  const workspaces = memberships.map((m) => m.workspace);
  const workspaceIds = workspaces.map((w) => w.id);
  const workspaceNameById = new Map(workspaces.map((w) => [w.id, w.name]));

  const { start, end } = getQueryRange(view, anchor);

  const rawMeetings = workspaceIds.length > 0
    ? await prisma.meeting.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          startsAt: { gte: start, lte: end },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          canceledAt: true,
          workspaceId: true,
          participants: {
            where: { userId: currentUser.id },
            select: { status: true },
            take: 1,
          },
        },
        orderBy: { startsAt: "asc" },
      })
    : [];

  const meetings: CalMeeting[] = rawMeetings.map((m) => ({
    id: m.id,
    title: m.title,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    canceledAt: m.canceledAt,
    workspaceId: m.workspaceId ?? "",
    workspaceName: workspaceNameById.get(m.workspaceId ?? "") ?? "Workspace",
    myRsvp: m.participants[0]?.status ?? null,
  }));

  const nav = getNavUrls(view, anchor);
  const byDay = groupByDay(meetings);

  const headerLabel = (() => {
    switch (view) {
      case "month":
        return anchor.toLocaleString("en-US", { month: "long", year: "numeric" });
      case "week": {
        const days = getWeekDays(anchor);
        const s = days[0].toLocaleString("en-US", { month: "short", day: "numeric" });
        const e = days[6].toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return `${s} – ${e}`;
      }
      case "day":
        return anchor.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      case "agenda":
        return `From ${anchor.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
    }
  })();

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">

      {/* Page title */}
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">Calendar</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            All sessions across {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Workspace filter pills (visual only — shows context) */}
        <div className="flex flex-wrap gap-1.5">
          {workspaces.slice(0, 4).map((w) => (
            <Link
              key={w.id}
              href={`/workspaces/${w.id}/calendar`}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 font-mono text-xs text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
              title={`Open ${w.name}'s calendar`}
            >
              {w.name}
            </Link>
          ))}
          {workspaces.length > 4 ? (
            <span className="rounded-full border border-[var(--color-border)] px-3 py-1 font-mono text-xs text-[var(--color-subtle)]">
              +{workspaces.length - 4} more
            </span>
          ) : null}
        </div>
      </div>

      {/* Calendar controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={nav.prev}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <h2 className="min-w-[200px] text-center font-display text-xl font-bold text-[var(--color-text)]">
            {headerLabel}
          </h2>
          <Link
            href={nav.next}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </Link>
        </div>

        <Link
          href={nav.today}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
        >
          Today
        </Link>

        <div className="flex-1" />

        <div className="flex overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]">
          {(["month", "week", "day", "agenda"] as const).map((v) => (
            <Link
              key={v}
              href={nav.switchView(v)}
              className={`px-3.5 py-1.5 font-mono text-xs font-semibold capitalize transition ${
                view === v
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
      </div>

      {/* Views */}
      {view === "month" && (
        <MonthView
          year={anchor.getFullYear()}
          month={anchor.getMonth()}
          today={today}
          byDay={byDay}
          now={now}
          dayUrl={nav.day}
        />
      )}
      {view === "week" && (
        <WeekView
          days={getWeekDays(anchor)}
          today={today}
          byDay={byDay}
          now={now}
        />
      )}
      {view === "day" && (
        <DayView
          meetings={byDay.get(toDateParam(anchor)) ?? []}
          now={now}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          start={anchor}
          days={60}
          byDay={byDay}
          now={now}
        />
      )}
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthView({ year, month, today, byDay, now, dayUrl }: {
  year: number; month: number; today: Date;
  byDay: Map<string, CalMeeting[]>; now: Date;
  dayUrl: (d: Date) => string;
}) {
  const days = getMonthGridDays(year, month);
  const weeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7));
  const visibleWeeks = weeks.filter((week, i) =>
    i < 4 || week.some((d) => d.getMonth() === month)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-3 text-center font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">{name}</div>
        ))}
      </div>
      {visibleWeeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            const key = toDateParam(day);
            const dayMeetings = byDay.get(key) ?? [];
            const isToday = sameDay(day, today);
            const isCurrentMonth = day.getMonth() === month;
            return (
              <div
                key={key}
                className={`relative min-h-[120px] border-b border-r border-[var(--color-border)] p-2 last:border-r-0 ${
                  !isCurrentMonth ? "bg-[var(--color-bg)]" : di >= 5 ? "bg-[var(--color-surface)]" : ""
                } ${wi === visibleWeeks.length - 1 ? "border-b-0" : ""}`}
              >
                <Link href={dayUrl(day)} className="inline-block">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold transition hover:bg-[var(--color-surface-mid)] ${
                    isToday ? "bg-[var(--color-secondary)] text-white" : isCurrentMonth ? "text-[var(--color-text)]" : "text-[var(--color-subtle)] opacity-40"
                  }`}>
                    {day.getDate()}
                  </span>
                </Link>
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayMeetings.slice(0, 2).map((m) => (
                    <MeetingPill key={m.id} meeting={m} now={now} compact />
                  ))}
                  {dayMeetings.length > 2 ? (
                    <Link href={dayUrl(day)} className="pl-1 font-mono text-[10px] text-[var(--color-subtle)] hover:text-[var(--color-secondary)]">
                      +{dayMeetings.length - 2} more
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────────────────────

function WeekView({ days, today, byDay, now }: {
  days: Date[]; today: Date;
  byDay: Map<string, CalMeeting[]>; now: Date;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = toDateParam(day);
          const dayMeetings = byDay.get(key) ?? [];
          const isToday = sameDay(day, today);
          return (
            <div
              key={key}
              className={`min-h-[240px] border-r border-[var(--color-border)] p-3 last:border-r-0 ${
                isToday ? "bg-[var(--color-secondary-dim)]" : i >= 5 ? "bg-[var(--color-bg)]" : ""
              }`}
            >
              <div className={`mb-3 text-center ${isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-muted)]"}`}>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest">{DAY_NAMES[i]}</p>
                <p className={`mt-0.5 font-display text-lg font-bold leading-none ${isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-text)]"}`}>
                  {day.getDate()}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                {dayMeetings.map((m) => <MeetingPill key={m.id} meeting={m} now={now} />)}
                {dayMeetings.length === 0 ? (
                  <p className="mt-4 text-center font-mono text-[10px] text-[var(--color-subtle)] opacity-50">—</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day view ───────────────────────────────────────────────────────────────────

function DayView({ meetings, now }: { meetings: CalMeeting[]; now: Date }) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-16 text-center">
        <p className="text-sm text-[var(--color-subtle)]">No sessions scheduled for this day across any workspace.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {meetings.map((m) => <DayMeetingCard key={m.id} meeting={m} now={now} />)}
    </div>
  );
}

function DayMeetingCard({ meeting, now }: { meeting: CalMeeting; now: Date }) {
  const lc = getCalLifecycle(meeting, now);
  const isLive = lc === "live";
  return (
    <Link
      href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`}
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
        isLive
          ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-secondary)]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <LifecyclePill lc={lc} />
          <span className="rounded-full bg-[var(--color-surface-high)] px-2 py-0.5 font-mono text-xs text-[var(--color-subtle)]">
            {meeting.workspaceName}
          </span>
        </div>
        <h3 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-text)]">{meeting.title}</h3>
        <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
          {meeting.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          {meeting.endsAt ? ` – ${meeting.endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
        isLive ? "bg-[var(--color-secondary)] text-white" : "border border-[var(--color-border)] text-[var(--color-muted)]"
      }`}>
        {isLive ? "Join now" : lc === "ended" ? "Review" : "View"}
      </span>
    </Link>
  );
}

// ── Agenda view ────────────────────────────────────────────────────────────────

function AgendaView({ start, days, byDay, now }: {
  start: Date; days: number;
  byDay: Map<string, CalMeeting[]>; now: Date;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dated: { day: Date; meetings: CalMeeting[] }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i);
    const m = byDay.get(toDateParam(d)) ?? [];
    if (m.length > 0) dated.push({ day: d, meetings: m });
  }

  if (dated.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-16 text-center">
        <p className="text-sm text-[var(--color-subtle)]">No sessions in the next {days} days across any workspace.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {dated.map(({ day, meetings }) => {
        const isToday = sameDay(day, today);
        return (
          <div key={toDateParam(day)}>
            <div className="mb-3 flex items-center gap-3">
              <span className={`font-mono text-xs font-semibold uppercase tracking-widest ${isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-subtle)]"}`}>
                {isToday ? "Today · " : ""}{day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <div className="flex-1 border-t border-[var(--color-border)]" />
            </div>
            <div className="flex flex-col gap-2">
              {meetings.map((m) => <DayMeetingCard key={m.id} meeting={m} now={now} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────

function MeetingPill({ meeting, now, compact = false }: {
  meeting: CalMeeting; now: Date; compact?: boolean;
}) {
  const lc = getCalLifecycle(meeting, now);
  const isCanceled = lc === "canceled";
  const isLive = lc === "live";
  const isEnded = lc === "ended";

  return (
    <Link
      href={`/workspaces/${meeting.workspaceId}/meetings/${meeting.id}`}
      className={`block truncate rounded-[4px] border-l-2 px-1.5 py-0.5 text-[11px] leading-tight transition hover:opacity-80 ${
        isCanceled
          ? "border-[var(--color-border)] bg-[var(--color-surface-mid)] text-[var(--color-subtle)] line-through opacity-60"
          : isLive
          ? "border-[var(--color-danger)] bg-[var(--color-danger-dim)] font-semibold text-[var(--color-danger)]"
          : isEnded
          ? "border-[var(--color-border-strong)] bg-[var(--color-surface-high)] text-[var(--color-muted)]"
          : "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] font-semibold text-[var(--color-secondary)]"
      }`}
    >
      {compact ? (
        meeting.title
      ) : (
        <>
          <span className="opacity-70">{meeting.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          {" "}{meeting.title}
        </>
      )}
    </Link>
  );
}

function LifecyclePill({ lc }: { lc: "live" | "upcoming" | "ended" | "canceled" }) {
  const map = {
    live:     { label: "Live",     cls: "bg-[var(--color-danger-dim)] text-[var(--color-danger)]" },
    upcoming: { label: "Upcoming", cls: "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" },
    ended:    { label: "Ended",    cls: "bg-[var(--color-surface-high)] text-[var(--color-muted)]" },
    canceled: { label: "Canceled", cls: "bg-[var(--color-danger-dim)] text-[var(--color-danger)] opacity-70" },
  };
  const { label, cls } = map[lc];
  return <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${cls}`}>{label}</span>;
}
