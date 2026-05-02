import "server-only";

import { escapeHtml, sendResendEmail } from "./resend";

type SendWorkspaceInviteEmailInput = {
  email: string;
  inviteUrl: string;
  invitedByName: string;
  role: string;
  workspaceName: string;
};

type SendWorkspaceInviteEmailResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "not-configured" | "send-failed";
    };

export async function sendWorkspaceInviteEmail({
  email,
  inviteUrl,
  invitedByName,
  role,
  workspaceName,
}: SendWorkspaceInviteEmailInput): Promise<SendWorkspaceInviteEmailResult> {
  return sendResendEmail({
    to: email,
    subject: `${invitedByName} invited you to ${workspaceName} on Scribbl`,
    text: [
      `${invitedByName} invited you to join ${workspaceName} as ${role.toLowerCase()} on Scribbl.`,
      "",
      "Accept the invite here:",
      inviteUrl,
      "",
      "This invite expires in 14 days.",
    ].join("\n"),
    html: createInviteEmailHtml({
      inviteUrl,
      invitedByName,
      role,
      workspaceName,
    }),
  });
}

function createInviteEmailHtml({
  inviteUrl,
  invitedByName,
  role,
  workspaceName,
}: Omit<SendWorkspaceInviteEmailInput, "email">) {
  const safeInviteUrl = escapeHtml(inviteUrl);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeRole = escapeHtml(role.toLowerCase());
  const safeWorkspaceName = escapeHtml(workspaceName);

  return `
    <div style="font-family: Arial, sans-serif; color: #20201d; line-height: 1.5;">
      <p>${safeInvitedByName} invited you to join <strong>${safeWorkspaceName}</strong> as ${safeRole} on Scribbl.</p>
      <p>
        <a href="${safeInviteUrl}" style="display: inline-block; background: #2f604b; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">
          Accept invite
        </a>
      </p>
      <p style="color: #62645c; font-size: 14px;">This invite expires in 14 days.</p>
      <p style="color: #62645c; font-size: 14px;">If the button does not work, copy and paste this link into your browser:<br />${safeInviteUrl}</p>
    </div>
  `;
}
