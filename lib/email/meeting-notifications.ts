import "server-only";

import { escapeHtml, sendResendEmail, type SendEmailResult } from "./resend";

type MeetingEmailInput = {
  canceledByName?: string;
  cancellationReason?: string | null;
  description?: string | null;
  durationMinutes: number;
  meetingUrl: string;
  recipients: string[];
  scheduledByName?: string;
  startsAt: Date;
  timeZone?: string;
  title: string;
  workspaceName: string;
};

export async function sendMeetingScheduledEmail({
  description,
  durationMinutes,
  meetingUrl,
  recipients,
  scheduledByName,
  startsAt,
  timeZone,
  title,
  workspaceName,
}: MeetingEmailInput): Promise<SendEmailResult> {
  return sendResendEmail({
    to: recipients,
    subject: `${title} scheduled in ${workspaceName}`,
    text: [
      `${scheduledByName ?? "A workspace member"} scheduled ${title} in ${workspaceName}.`,
      "",
      `When: ${formatDateTime(startsAt, timeZone)}`,
      `Duration: ${formatDuration(durationMinutes)}`,
      description ? `Description: ${description}` : "",
      "",
      "Open the meeting:",
      meetingUrl,
    ].filter(Boolean).join("\n"),
    html: createMeetingScheduledHtml({
      description,
      durationMinutes,
      meetingUrl,
      scheduledByName,
      startsAt,
      timeZone,
      title,
      workspaceName,
    }),
  });
}

type MeetingSeriesEmailInput = {
  creatorEmail: string;
  description?: string;
  durationMinutes: number;
  firstSessionAt: Date;
  lastSessionAt: Date;
  recurrence: string;
  recipients: string[];
  scheduledByName: string;
  sessionCount: number;
  timeZone?: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
};

export async function sendMeetingSeriesScheduledEmail({
  creatorEmail,
  description,
  durationMinutes,
  firstSessionAt,
  lastSessionAt,
  recurrence,
  recipients,
  scheduledByName,
  sessionCount,
  timeZone,
  title,
  workspaceId,
  workspaceName,
}: MeetingSeriesEmailInput): Promise<SendEmailResult> {
  const pattern = formatRecurrencePattern(recurrence, firstSessionAt, timeZone);
  const dateRange = `${formatShortDate(firstSessionAt, timeZone)} – ${formatShortDate(lastSessionAt, timeZone)}`;
  const sessionLine = `${dateRange} · ${sessionCount} session${sessionCount === 1 ? "" : "s"}`;
  const timeRange = formatTimeRange(firstSessionAt, durationMinutes, timeZone);
  const meetingsUrl = `/workspaces/${workspaceId}/meetings`;

  const filteredRecipients = uniqueSeriesEmails(recipients).filter((e) => e !== creatorEmail);

  return sendResendEmail({
    to: filteredRecipients,
    subject: `${title} has been scheduled in ${workspaceName}`,
    text: [
      `${scheduledByName} scheduled a recurring meeting in ${workspaceName}.`,
      "",
      title,
      `${pattern} · ${sessionLine}`,
      timeRange,
      description ? `Description: ${description}` : "",
      "",
      "Each session has its own hub with notes and chat.",
      "You'll find them all in the Meetings section:",
      meetingsUrl,
    ].filter(Boolean).join("\n"),
    html: createSeriesScheduledHtml({
      description,
      meetingsUrl,
      pattern,
      scheduledByName,
      sessionLine,
      timeRange,
      title,
      workspaceName,
    }),
  });
}

function createSeriesScheduledHtml({
  description,
  meetingsUrl,
  pattern,
  scheduledByName,
  sessionLine,
  timeRange,
  title,
  workspaceName,
}: {
  description?: string;
  meetingsUrl: string;
  pattern: string;
  scheduledByName: string;
  sessionLine: string;
  timeRange: string;
  title: string;
  workspaceName: string;
}) {
  const safeMeetingsUrl = escapeHtml(meetingsUrl);

  return `
    <div style="font-family: Arial, sans-serif; color: #20201d; line-height: 1.5;">
      <p>${escapeHtml(scheduledByName)} scheduled a recurring meeting in <strong>${escapeHtml(workspaceName)}</strong>.</p>
      <div style="margin: 20px 0; padding: 16px 20px; border-left: 3px solid #085ac0; background: #f4f7ff; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 6px; font-size: 17px; font-weight: 600;">${escapeHtml(title)}</p>
        <p style="margin: 0 0 4px; color: #45464d;">${escapeHtml(pattern)} &middot; ${escapeHtml(sessionLine)}</p>
        <p style="margin: 0; color: #45464d;">${escapeHtml(timeRange)}</p>
        ${description ? `<p style="margin: 10px 0 0; color: #45464d;">${escapeHtml(description)}</p>` : ""}
      </div>
      <p style="color: #45464d;">Each session has its own hub with notes and chat. You&apos;ll find them all in the Meetings section.</p>
      <p>
        <a href="${safeMeetingsUrl}" style="display: inline-block; background: #085ac0; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
          View meetings
        </a>
      </p>
      <p style="color: #62645c; font-size: 14px;">If the button does not work, copy and paste this link into your browser:<br />${safeMeetingsUrl}</p>
    </div>
  `;
}

function formatRecurrencePattern(recurrence: string, startsAt: Date, timeZone?: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    ...(timeZone ? { timeZone } : {}),
  }).format(startsAt);

  switch (recurrence) {
    case "DAILY": return "Daily";
    case "WEEKLY": return `Weekly on ${weekday}s`;
    case "BIWEEKLY": return `Biweekly on ${weekday}s`;
    case "MONTHLY": return `Monthly on the ${ordinal(startsAt.getDate())}`;
    default: return recurrence.toLowerCase();
  }
}

function formatShortDate(date: Date, timeZone?: string): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatTimeRange(startsAt: Date, durationMinutes: number, timeZone?: string): string {
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  };
  return `${startsAt.toLocaleTimeString("en-US", opts)} – ${endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) })}`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function uniqueSeriesEmails(emails: string[]): string[] {
  return Array.from(new Set(emails.map((e) => e.toLowerCase()).filter(Boolean)));
}

export async function sendMeetingCanceledEmail({
  canceledByName,
  cancellationReason,
  durationMinutes,
  meetingUrl,
  recipients,
  startsAt,
  timeZone,
  title,
  workspaceName,
}: MeetingEmailInput): Promise<SendEmailResult> {
  return sendResendEmail({
    to: recipients,
    subject: `${title} was canceled`,
    text: [
      `${canceledByName ?? "A workspace member"} canceled ${title} in ${workspaceName}.`,
      "",
      `Original time: ${formatDateTime(startsAt, timeZone)}`,
      `Duration: ${formatDuration(durationMinutes)}`,
      cancellationReason ? `Reason: ${cancellationReason}` : "",
      "",
      "Open the meeting record:",
      meetingUrl,
    ].filter(Boolean).join("\n"),
    html: createMeetingCanceledHtml({
      canceledByName,
      cancellationReason,
      durationMinutes,
      meetingUrl,
      startsAt,
      timeZone,
      title,
      workspaceName,
    }),
  });
}

function createMeetingScheduledHtml({
  description,
  durationMinutes,
  meetingUrl,
  scheduledByName,
  startsAt,
  timeZone,
  title,
  workspaceName,
}: Omit<MeetingEmailInput, "recipients" | "canceledByName" | "cancellationReason">) {
  return createMeetingEmailShell({
    actionLabel: "Open meeting",
    body: [
      `${escapeHtml(scheduledByName ?? "A workspace member")} scheduled <strong>${escapeHtml(title)}</strong> in <strong>${escapeHtml(workspaceName)}</strong>.`,
      `<strong>When:</strong> ${escapeHtml(formatDateTime(startsAt, timeZone))}`,
      `<strong>Duration:</strong> ${escapeHtml(formatDuration(durationMinutes))}`,
      description ? `<strong>Description:</strong> ${escapeHtml(description)}` : "",
    ],
    meetingUrl,
  });
}

function createMeetingCanceledHtml({
  canceledByName,
  cancellationReason,
  durationMinutes,
  meetingUrl,
  startsAt,
  timeZone,
  title,
  workspaceName,
}: Omit<MeetingEmailInput, "recipients" | "description" | "scheduledByName">) {
  return createMeetingEmailShell({
    actionLabel: "Open meeting record",
    body: [
      `${escapeHtml(canceledByName ?? "A workspace member")} canceled <strong>${escapeHtml(title)}</strong> in <strong>${escapeHtml(workspaceName)}</strong>.`,
      `<strong>Original time:</strong> ${escapeHtml(formatDateTime(startsAt, timeZone))}`,
      `<strong>Duration:</strong> ${escapeHtml(formatDuration(durationMinutes))}`,
      cancellationReason ? `<strong>Reason:</strong> ${escapeHtml(cancellationReason)}` : "",
    ],
    meetingUrl,
  });
}

function createMeetingEmailShell({
  actionLabel,
  body,
  meetingUrl,
}: {
  actionLabel: string;
  body: string[];
  meetingUrl: string;
}) {
  const safeMeetingUrl = escapeHtml(meetingUrl);

  return `
    <div style="font-family: Arial, sans-serif; color: #20201d; line-height: 1.5;">
      ${body.filter(Boolean).map((line) => `<p>${line}</p>`).join("")}
      <p>
        <a href="${safeMeetingUrl}" style="display: inline-block; background: #2f604b; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
          ${escapeHtml(actionLabel)}
        </a>
      </p>
      <p style="color: #62645c; font-size: 14px;">If the button does not work, copy and paste this link into your browser:<br />${safeMeetingUrl}</p>
    </div>
  `;
}

function formatDateTime(value: Date, timeZone?: string) {
  return value.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours.toFixed(1)} hours`;
}
