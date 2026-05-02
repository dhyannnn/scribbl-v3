import "server-only";

import { escapeHtml, sendResendEmail, type SendEmailResult } from "./resend";

export async function sendWorkspaceInviteAcceptedEmail({
  acceptedByEmail,
  acceptedByName,
  recipients,
  role,
  workspaceName,
  workspaceUrl,
}: {
  acceptedByEmail: string;
  acceptedByName: string;
  recipients: string[];
  role: string;
  workspaceName: string;
  workspaceUrl: string;
}): Promise<SendEmailResult> {
  return sendResendEmail({
    to: recipients,
    subject: `${acceptedByName} joined ${workspaceName}`,
    text: [
      `${acceptedByName} (${acceptedByEmail}) accepted the invite to ${workspaceName} as ${role.toLowerCase()}.`,
      "",
      "Open the workspace:",
      workspaceUrl,
    ].join("\n"),
    html: createInviteAcceptedHtml({
      acceptedByEmail,
      acceptedByName,
      role,
      workspaceName,
      workspaceUrl,
    }),
  });
}

function createInviteAcceptedHtml({
  acceptedByEmail,
  acceptedByName,
  role,
  workspaceName,
  workspaceUrl,
}: {
  acceptedByEmail: string;
  acceptedByName: string;
  role: string;
  workspaceName: string;
  workspaceUrl: string;
}) {
  const safeWorkspaceUrl = escapeHtml(workspaceUrl);

  return `
    <div style="font-family: Arial, sans-serif; color: #20201d; line-height: 1.5;">
      <p><strong>${escapeHtml(acceptedByName)}</strong> (${escapeHtml(acceptedByEmail)}) accepted the invite to <strong>${escapeHtml(workspaceName)}</strong> as ${escapeHtml(role.toLowerCase())}.</p>
      <p>
        <a href="${safeWorkspaceUrl}" style="display: inline-block; background: #2f604b; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
          Open workspace
        </a>
      </p>
      <p style="color: #62645c; font-size: 14px;">If the button does not work, copy and paste this link into your browser:<br />${safeWorkspaceUrl}</p>
    </div>
  `;
}
