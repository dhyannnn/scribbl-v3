import "server-only";

import { logger } from "@/lib/logger";

export type SendEmailResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "not-configured" | "send-failed";
    };

export async function sendResendEmail({
  html,
  subject,
  text,
  to,
}: {
  html: string;
  subject: string;
  text: string;
  to: string | string[];
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  if (recipients.length === 0) {
    return {
      ok: true,
    };
  }

  if (!apiKey || !from) {
    return {
      ok: false,
      reason: "not-configured",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      logger.resendError({ to: recipients, subject, status: response.status });
      return {
        ok: false,
        reason: "send-failed",
      };
    }
  } catch (err) {
    logger.resendError({ to: recipients, subject }, err);
    return {
      ok: false,
      reason: "send-failed",
    };
  }

  return {
    ok: true,
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
