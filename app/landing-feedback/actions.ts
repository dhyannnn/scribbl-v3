"use server";

import { escapeHtml, sendResendEmail } from "@/lib/email/resend";

export type LandingFeedbackState = {
  ok: boolean;
  message: string;
};

export async function submitLandingFeedback(
  _previousState: LandingFeedbackState,
  formData: FormData
): Promise<LandingFeedbackState> {
  const feedback = String(formData.get("feedback") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (feedback.length < 8) {
    return {
      ok: false,
      message: "Tell us a little more before sending.",
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      message: "Enter a valid email address.",
    };
  }

  const result = await sendResendEmail({
    to: "hello@scribblapp.ca",
    subject: "New Scribbl landing page feedback",
    text: `From: ${email}\n\n${feedback}`,
    html: `
      <h1>New Scribbl landing page feedback</h1>
      <p><strong>From:</strong> ${escapeHtml(email)}</p>
      <p>${escapeHtml(feedback).replace(/\r?\n/g, "<br>")}</p>
    `,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: "We could not send that yet. Please email hello@scribblapp.ca directly.",
    };
  }

  return {
    ok: true,
    message: "Thank you.",
  };
}
