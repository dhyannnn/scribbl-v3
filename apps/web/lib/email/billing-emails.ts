import { escapeHtml, sendResendEmail } from "./resend";

export async function sendCancellationEmail({
  to,
  workspaceName,
  planName,
  periodEnd,
}: {
  to: string;
  workspaceName: string;
  planName: string;
  periodEnd?: Date;
}) {
  const endsOn = periodEnd
    ? periodEnd.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : null;

  const safeName = escapeHtml(workspaceName);
  const safePlan = escapeHtml(planName);

  return sendResendEmail({
    to,
    subject: `Your Scribbl ${safePlan} subscription has been canceled`,
    text: [
      `Your ${planName} subscription for "${workspaceName}" has been canceled.`,
      endsOn
        ? `You'll continue to have access to paid features until ${endsOn}. After that, the workspace will revert to the Free plan.`
        : `The workspace has reverted to the Free plan.`,
      `All your notes, files, meetings, and chat history are preserved.`,
      `You can re-subscribe anytime from Settings → Billing inside your workspace.`,
    ].join("\n\n"),
    html: `
      <p>Your <strong>${safePlan}</strong> subscription for <strong>${safeName}</strong> has been canceled.</p>
      ${endsOn ? `<p>You'll continue to have access to paid features until <strong>${escapeHtml(endsOn)}</strong>. After that, the workspace will revert to the Free plan.</p>` : `<p>The workspace has reverted to the Free plan.</p>`}
      <p>All your notes, files, meetings, and chat history are preserved.</p>
      <p>You can re-subscribe anytime from <strong>Settings → Billing</strong> inside your workspace.</p>
    `,
  });
}

export async function sendPaymentFailedEmail({
  to,
  workspaceName,
  manageUrl,
}: {
  to: string;
  workspaceName: string;
  manageUrl: string;
}) {
  const safeName = escapeHtml(workspaceName);
  const safeUrl = escapeHtml(manageUrl);

  return sendResendEmail({
    to,
    subject: `Action required: payment failed for ${safeName}`,
    text: [
      `We couldn't process your payment for "${workspaceName}".`,
      `Please update your payment method to avoid losing access to paid features.`,
      `Manage billing: ${manageUrl}`,
    ].join("\n\n"),
    html: `
      <p>We couldn't process your payment for <strong>${safeName}</strong>.</p>
      <p>Please update your payment method to avoid losing access to paid features.</p>
      <p><a href="${safeUrl}">Update payment method →</a></p>
    `,
  });
}
