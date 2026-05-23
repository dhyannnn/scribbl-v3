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
