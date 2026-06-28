import "server-only";

import type { WorkspaceInviteStatus, WorkspaceRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { createAppUrl } from "@/lib/app-url";
import { FREE_MEMBER_LIMIT } from "@/lib/billing";
import { sendWorkspaceInviteAcceptedEmail } from "@/lib/email/invite-accepted";
import { prisma } from "@/lib/prisma";

export type WorkspaceInviteAcceptanceUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AcceptWorkspaceInviteResult =
  | {
      ok: true;
      meetingIds: string[];
      notificationStatus: string;
      workspaceId: string;
      workspaceMembership: {
        role: WorkspaceRole;
        workspace: {
          id: string;
          name: string;
          type: "TEAM" | "PROJECT" | "CLASS";
          plan: "FREE" | "PRO" | "INSTITUTION" | "ENTERPRISE";
          description: string | null;
          _count: { members: number };
        };
      };
    }
  | {
      ok: false;
      code: "not_found" | "already_handled" | "expired" | "email_mismatch" | "payment_failed" | "member_limit";
      status: number;
      message: string;
      redirectHref?: string;
      workspaceId?: string;
    };

type InviteAcceptanceRecord = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  status: WorkspaceInviteStatus;
  expiresAt: Date;
  workspace: {
    id: string;
    name: string;
    type: "TEAM" | "PROJECT" | "CLASS";
    plan: "FREE" | "PRO" | "INSTITUTION" | "ENTERPRISE";
    description: string | null;
    members: { user: { email: string } }[];
    _count: { members: number };
  };
};

export async function acceptWorkspaceInviteById(inviteId: string, currentUser: WorkspaceInviteAcceptanceUser) {
  if (!inviteId) {
    return failure("not_found", 404, "Workspace invite not found.");
  }

  const invite = await prisma.workspaceInvite.findUnique({
    where: { id: inviteId },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          plan: true,
          description: true,
          members: {
            where: {
              status: "ACTIVE",
              role: { in: ["OWNER", "ADMIN"] },
            },
            select: {
              user: { select: { email: true } },
            },
          },
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
  });

  if (!invite) {
    return failure("not_found", 404, "Workspace invite not found.");
  }

  return acceptWorkspaceInvite(invite, currentUser);
}

export async function acceptWorkspaceInviteByToken(token: string, currentUser: WorkspaceInviteAcceptanceUser) {
  if (!token) {
    return failure("not_found", 404, "Workspace invite not found.");
  }

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          plan: true,
          description: true,
          members: {
            where: {
              status: "ACTIVE",
              role: { in: ["OWNER", "ADMIN"] },
            },
            select: {
              user: { select: { email: true } },
            },
          },
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
  });

  if (!invite) {
    return failure("not_found", 404, "Workspace invite not found.");
  }

  return acceptWorkspaceInvite(invite, currentUser, token);
}

async function acceptWorkspaceInvite(
  invite: InviteAcceptanceRecord,
  currentUser: WorkspaceInviteAcceptanceUser,
  token?: string,
): Promise<AcceptWorkspaceInviteResult> {
  if (invite.status !== "PENDING") {
    return failure("already_handled", 409, "Workspace invite is no longer pending.", `/workspaces/${invite.workspaceId}`, invite.workspaceId);
  }

  if (invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return failure("expired", 410, "Workspace invite has expired.", undefined, invite.workspaceId);
  }

  if (invite.email !== currentUser.email.toLowerCase()) {
    return failure("email_mismatch", 403, "This invite was sent to a different email address.");
  }

  const workspaceSub = await prisma.subscription.findFirst({
    where: { workspaceId: invite.workspaceId },
    select: { status: true },
  });

  if (workspaceSub?.status === "PAST_DUE") {
    return failure("payment_failed", 402, "This workspace needs billing attention before you can join.", invitePath(token, invite.id, "payment-failed"), invite.workspaceId);
  }

  if (invite.workspace.plan === "FREE") {
    const [activeMemberCount, existingMembership] = await Promise.all([
      prisma.workspaceMember.count({
        where: { workspaceId: invite.workspaceId, status: "ACTIVE" },
      }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: currentUser.id } },
        select: { status: true },
      }),
    ]);

    const isAlreadyActive = existingMembership?.status === "ACTIVE";
    if (!isAlreadyActive && activeMemberCount >= FREE_MEMBER_LIMIT) {
      return failure("member_limit", 409, "This free workspace has reached its member limit.", invitePath(token, invite.id, "limit-reached"), invite.workspaceId);
    }
  }

  let meetingIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: currentUser.id,
        },
      },
      select: { id: true },
    });

    if (existingMembership) {
      await tx.workspaceMember.update({
        where: { id: existingMembership.id },
        data: {
          status: "ACTIVE",
          joinedAt: new Date(),
          role: invite.role,
        },
      });
    } else {
      await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: currentUser.id,
          role: invite.role,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
    }

    const meetings = await tx.meeting.findMany({
      where: { workspaceId: invite.workspaceId },
      select: { id: true },
    });
    meetingIds = meetings.map((meeting) => meeting.id);

    if (meetings.length > 0) {
      await tx.meetingParticipant.createMany({
        data: meetings.map((meeting) => ({
          meetingId: meeting.id,
          userId: currentUser.id,
          status: "INVITED",
        })),
        skipDuplicates: true,
      });
    }

    await tx.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
  });

  await writeAuditLog({
    action: "MEMBER_INVITE_ACCEPTED",
    actorUserId: currentUser.id,
    workspaceId: invite.workspaceId,
    targetId: invite.id,
    metadata: { role: invite.role },
  });

  const notificationStatus = await sendInviteAcceptedNotification({
    acceptedByEmail: currentUser.email,
    acceptedByName: currentUser.displayName,
    recipients: invite.workspace.members.map((member) => member.user.email),
    role: invite.role,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspace.name,
  });

  const memberCount = await prisma.workspaceMember.count({
    where: { workspaceId: invite.workspaceId, status: "ACTIVE" },
  });
  const workspaceMembership = {
    role: invite.role,
    workspace: {
      id: invite.workspace.id,
      name: invite.workspace.name,
      type: invite.workspace.type,
      plan: invite.workspace.plan,
      description: invite.workspace.description,
      _count: { members: memberCount },
    },
  };

  return {
    ok: true,
    meetingIds,
    notificationStatus,
    workspaceId: invite.workspaceId,
    workspaceMembership,
  };
}

async function sendInviteAcceptedNotification({
  acceptedByEmail,
  acceptedByName,
  recipients,
  role,
  workspaceId,
  workspaceName,
}: {
  acceptedByEmail: string;
  acceptedByName: string;
  recipients: string[];
  role: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const result = await sendWorkspaceInviteAcceptedEmail({
    acceptedByEmail,
    acceptedByName,
    recipients: uniqueEmails(recipients).filter((email) => email !== acceptedByEmail),
    role,
    workspaceName,
    workspaceUrl: await createAppUrl(`/workspaces/${workspaceId}/members`),
  });

  if (result.ok) {
    return "invite-accepted";
  }

  return result.reason === "not-configured"
    ? "invite-accepted-email-not-configured"
    : "invite-accepted-email-failed";
}

function invitePath(token: string | undefined, inviteId: string, status: string) {
  return `/invites/${token ?? inviteId}?error=${status}`;
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.toLowerCase()).filter(Boolean)));
}

function failure(
  code: Extract<AcceptWorkspaceInviteResult, { ok: false }>["code"],
  status: number,
  message: string,
  redirectHref?: string,
  workspaceId?: string,
): AcceptWorkspaceInviteResult {
  return {
    ok: false,
    code,
    status,
    message,
    redirectHref,
    workspaceId,
  };
}
