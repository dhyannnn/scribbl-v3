import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

type CalendarView = "month" | "week" | "day" | "agenda";

type PageProps = {
  params: Promise<{ id: string }>;
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
  const dow = (d.getDay() + 6) % 7; // 0=Mon
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

function getNavUrls(view: CalendarView, anchor: Date, workspaceId: string) {
  const base = `/workspaces/${workspaceId}/calendar`;
  function url(d: Date) {
    return `${base}?view=${view}&date=${toDateParam(d)}`;
  }

  let prev: Date, next: Date;
  switch (view) {
    case "month":
      prev = addMonths(anchor, -1);
      next = addMonths(anchor, 1);
      break;
    case "week":
      prev = addDays(anchor, -7);
      next = addDays(anchor, 7);
      break;
    case "day":
      prev = addDays(anchor, -1);
      next = addDays(anchor, 1);
      break;
    case "agenda":
      prev = addDays(anchor, -14);
      next = addDays(anchor, 14);
      break;
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

// ── Types ──────────────────────────────────────────────────────────────────────

type CalMeeting = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  canceledAt: Date | null;
  recurrence: string | null;
  seriesId: string | null;
  groupName: string | null;
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default async function CalendarPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { view: viewRaw, date: dateRaw } = await searchParams;

  const view: CalendarView =
    viewRaw === "week" || viewRaw === "day" || viewRaw === "agenda" ? viewRaw : "month";

  const anchor = parseDate(dateRaw);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentUser = await getCurrentUser();
  if (!currentUser) return <ProtectedPageMessage />;

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      members: {
        where: { userId: currentUser.id, status: "ACTIVE" },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!workspace) notFound();
  if (!workspace.members[0]) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const { start, end } = getQueryRange(view, anchor);

  const rawMeetings = await prisma.meeting.findMany({
    where: {
      workspaceId: id,
      startsAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      canceledAt: true,
      recurrence: true,
      seriesId: true,
      group: { select: { name: true } },
      participants: {
        where: { userId: currentUser.id },
        select: { status: true },
        take: 1,
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const meetings: CalMeeting[] = rawMeetings.map((m) => ({
    id: m.id,
    title: m.title,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    canceledAt: m.canceledAt,
    recurrence: m.recurrence,
    seriesId: m.seriesId,
    groupName: m.group?.name ?? null,
    myRsvp: m.participants[0]?.status ?? null,
  }));

  const nav = getNavUrls(view, anchor, id);
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
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-3">

          {/* Month/period label + prev/next */}
          <div className="flex items-center gap-1">
            <Link
              href={nav.prev}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </Link>
            <h1 className="min-w-[200px] text-center font-display text-xl font-bold text-[var(--color-text)]">
              {headerLabel}
            </h1>
            <Link
              href={nav.next}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </Link>
          </div>

          {/* Today */}
          <Link
            href={nav.today}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 font-mono text-xs font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
          >
            Today
          </Link>

          {/* Spacer */}
          <div className="flex-1" />

          {/* View switcher */}
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

          {/* Schedule shortcut */}
          <Link
            href={`/workspaces/${id}/meetings`}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-secondary)] px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Schedule
          </Link>
        </div>

        {/* Views */}
        {view === "month" && (
          <MonthView
            year={anchor.getFullYear()}
            month={anchor.getMonth()}
            today={today}
            byDay={byDay}
            now={new Date()}
            workspaceId={id}
            dayUrl={nav.day}
          />
        )}
        {view === "week" && (
          <WeekView
            days={getWeekDays(anchor)}
            today={today}
            byDay={byDay}
            now={new Date()}
            workspaceId={id}
          />
        )}
        {view === "day" && (
          <DayView
            date={anchor}
            meetings={byDay.get(toDateParam(anchor)) ?? []}
            now={new Date()}
            workspaceId={id}
          />
        )}
        {view === "agenda" && (
          <AgendaView
            start={anchor}
            days={60}
            byDay={byDay}
            now={new Date()}
            workspaceId={id}
          />
        )}
      </div>
    </div>
  );
}

// ── Month view ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthView({
  year, month, today, byDay, now, workspaceId, dayUrl,
}: {
  year: number;
  month: number;
  today: Date;
  byDay: Map<string, CalMeeting[]>;
  now: Date;
  workspaceId: string;
  dayUrl: (d: Date) => string;
}) {
  const days = getMonthGridDays(year, month);
  const weeks: Date[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7));

  // Drop trailing week if all days are from next month
  const visibleWeeks = weeks.filter((week, i) =>
    i < 4 || week.some((d) => d.getMonth() === month)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-3 text-center font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
            {name}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {visibleWeeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            const key = toDateParam(day);
            const dayMeetings = byDay.get(key) ?? [];
            const isToday = sameDay(day, today);
            const isCurrentMonth = day.getMonth() === month;
            const isWeekend = di >= 5;

            return (
              <div
                key={key}
                className={`relative min-h-[120px] border-b border-r border-[var(--color-border)] p-2 last:border-r-0 ${
                  !isCurrentMonth ? "bg-[var(--color-bg)]" : isWeekend ? "bg-[var(--color-surface)]" : "bg-[var(--color-surface)]"
                } ${wi === visibleWeeks.length - 1 ? "border-b-0" : ""}`}
              >
                {/* Date number */}
                <Link
                  href={dayUrl(day)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition hover:bg-[var(--color-surface-mid)]"
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-semibold ${
                    isToday
                      ? "bg-[var(--color-secondary)] text-white"
                      : isCurrentMonth
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-subtle)] opacity-40"
                  }`}>
                    {day.getDate()}
                  </span>
                </Link>

                {/* Meeting pills */}
                <div className="mt-1 flex flex-col gap-0.5">
                  {dayMeetings.slice(0, 2).map((m) => (
                    <MeetingPill key={m.id} meeting={m} now={now} workspaceId={workspaceId} compact />
                  ))}
                  {dayMeetings.length > 2 ? (
                    <Link
                      href={dayUrl(day)}
                      className="pl-1 font-mono text-[10px] text-[var(--color-subtle)] hover:text-[var(--color-secondary)]"
                    >
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

function WeekView({
  days, today, byDay, now, workspaceId,
}: {
  days: Date[];
  today: Date;
  byDay: Map<string, CalMeeting[]>;
  now: Date;
  workspaceId: string;
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
              {/* Day header */}
              <div className={`mb-3 text-center ${isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-muted)]"}`}>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest">
                  {DAY_NAMES[i]}
                </p>
                <p className={`mt-0.5 font-display text-lg font-bold leading-none ${
                  isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-text)]"
                }`}>
                  {day.getDate()}
                </p>
              </div>

              {/* Meetings */}
              <div className="flex flex-col gap-1.5">
                {dayMeetings.map((m) => (
                  <MeetingPill key={m.id} meeting={m} now={now} workspaceId={workspaceId} />
                ))}
                {dayMeetings.length === 0 ? (
                  <p className="text-center font-mono text-[10px] text-[var(--color-subtle)] opacity-50 mt-4">—</p>
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

function DayView({
  meetings, now, workspaceId,
}: {
  date?: Date;
  meetings: CalMeeting[];
  now: Date;
  workspaceId: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-16 text-center">
          <p className="text-sm text-[var(--color-subtle)]">No sessions scheduled for this day.</p>
          <Link
            href={`/workspaces/${workspaceId}/meetings`}
            className="mt-4 inline-block rounded-full bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
          >
            Schedule one
          </Link>
        </div>
      ) : meetings.map((m) => (
        <DayMeetingCard key={m.id} meeting={m} now={now} workspaceId={workspaceId} />
      ))}
    </div>
  );
}

function DayMeetingCard({
  meeting, now, workspaceId,
}: {
  meeting: CalMeeting;
  now: Date;
  workspaceId: string;
}) {
  const lc = getCalLifecycle(meeting, now);
  const isLive = lc === "live";

  return (
    <Link
      href={`/workspaces/${workspaceId}/meetings/${meeting.id}`}
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm transition hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${
        isLive
          ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-secondary)]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <LifecyclePill lc={lc} />
          {meeting.recurrence ? (
            <span className="font-mono text-xs text-[var(--color-subtle)]">↻ {meeting.recurrence.toLowerCase()}</span>
          ) : null}
          {meeting.groupName ? (
            <span className="rounded-full bg-[var(--color-secondary-dim)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
              {meeting.groupName}
            </span>
          ) : null}
        </div>
        <h3 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-text)]">{meeting.title}</h3>
        <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
          {meeting.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          {meeting.endsAt ? ` – ${meeting.endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      </div>
      <div className="shrink-0">
        <span className={`inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${
          isLive
            ? "bg-[var(--color-secondary)] text-white"
            : "border border-[var(--color-border)] text-[var(--color-muted)]"
        }`}>
          {isLive ? "Join now" : lc === "ended" ? "Review" : "View"}
        </span>
      </div>
    </Link>
  );
}

// ── Agenda view ────────────────────────────────────────────────────────────────

function AgendaView({
  start, days, byDay, now, workspaceId,
}: {
  start: Date;
  days: number;
  byDay: Map<string, CalMeeting[]>;
  now: Date;
  workspaceId: string;
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
        <p className="text-sm text-[var(--color-subtle)]">No upcoming sessions in the next {days} days.</p>
        <Link
          href={`/workspaces/${workspaceId}/meetings`}
          className="mt-4 inline-block rounded-full bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
        >
          Schedule one
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {dated.map(({ day, meetings }) => {
        const isToday = sameDay(day, today);
        return (
          <div key={toDateParam(day)}>
            {/* Date separator */}
            <div className="mb-3 flex items-center gap-3">
              <span className={`font-mono text-xs font-semibold uppercase tracking-widest ${
                isToday ? "text-[var(--color-secondary)]" : "text-[var(--color-subtle)]"
              }`}>
                {isToday ? "Today · " : ""}{day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <div className="flex-1 border-t border-[var(--color-border)]" />
            </div>
            <div className="flex flex-col gap-2">
              {meetings.map((m) => (
                <DayMeetingCard key={m.id} meeting={m} now={now} workspaceId={workspaceId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function MeetingPill({
  meeting, now, workspaceId, compact = false,
}: {
  meeting: CalMeeting;
  now: Date;
  workspaceId: string;
  compact?: boolean;
}) {
  const lc = getCalLifecycle(meeting, now);
  const isLive = lc === "live";
  const isEnded = lc === "ended";
  const isCanceled = lc === "canceled";

  const pillClass = `block truncate rounded-[4px] border-l-2 px-1.5 py-0.5 text-[11px] leading-tight transition ${
    isCanceled
      ? "border-[var(--color-border)] bg-[var(--color-surface-mid)] text-[var(--color-subtle)] line-through opacity-60"
      : isLive
      ? "border-[var(--color-danger)] bg-[var(--color-danger-dim)] font-semibold text-[var(--color-danger)]"
      : isEnded
      ? "border-[var(--color-border-strong)] bg-[var(--color-surface-high)] text-[var(--color-muted)]"
      : "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] font-semibold text-[var(--color-secondary)]"
  } hover:opacity-80`;

  return (
    <Link href={`/workspaces/${workspaceId}/meetings/${meeting.id}`} className={pillClass}>
      {meeting.recurrence ? "↻ " : ""}{compact ? meeting.title : (
        <>
          <span className="opacity-70">
            {meeting.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
          {" "}{meeting.title}
        </>
      )}
    </Link>
  );
}

function LifecyclePill({ lc }: { lc: CalLifecycle }) {
  const map: Record<CalLifecycle, { label: string; cls: string }> = {
    live: { label: "Live", cls: "bg-[var(--color-danger-dim)] text-[var(--color-danger)]" },
    upcoming: { label: "Upcoming", cls: "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" },
    ended: { label: "Ended", cls: "bg-[var(--color-surface-high)] text-[var(--color-muted)]" },
    canceled: { label: "Canceled", cls: "bg-[var(--color-danger-dim)] text-[var(--color-danger)] opacity-70" },
  };
  const { label, cls } = map[lc];
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${cls}`}>{label}</span>
  );
}
