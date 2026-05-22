"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { createAppUrl } from "@/lib/app-url";
import { FREE_MEMBER_LIMIT } from "@/lib/billing";
import { getCurrentUser } from "@/lib/current-user";
import { sendWorkspaceInviteAcceptedEmail } from "@/lib/email/invite-accepted";
import { prisma } from "@/lib/prisma";

export async function acceptWorkspaceInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  if (!token) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/invites/${token}`)}`);
  }

  const invite = await prisma.workspaceInvite.findUnique({
    where: {
      token,
    },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      workspace: {
        select: {
          name: true,
          plan: true,
          members: {
            where: {
              status: "ACTIVE",
              role: {
                in: ["OWNER", "ADMIN"],
              },
            },
            select: {
              user: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!invite) {
    return;
  }

  if (invite.status !== "PENDING") {
    redirect(`/workspaces/${invite.workspaceId}`);
  }

  if (invite.expiresAt < new Date()) {
    await prisma.workspaceInvite.update({
      where: {
        id: invite.id,
      },
      data: {
        status: "EXPIRED",
      },
    });
    revalidatePath(`/workspaces/${invite.workspaceId}/members`);
    return;
  }

  if (invite.email !== currentUser.email.toLowerCase()) {
    return;
  }

  // Block joining a workspace whose subscription payment has failed
  const workspaceSub = await prisma.subscription.findFirst({
    where: { workspaceId: invite.workspaceId },
    select: { status: true },
  });
  if (workspaceSub?.status === "PAST_DUE") {
    redirect(`/invites/${token}?error=payment-failed`);
  }

  // On Free workspaces, enforce the member limit at acceptance time.
  // The invite-creation check isn't sufficient because multiple invites can be
  // sent and accepted simultaneously, each passing the check individually.
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
    // Only block if this acceptance would add a net-new active member.
    // If the user is already active (re-accepting), the count doesn't change.
    const isAlreadyActive = existingMembership?.status === "ACTIVE";
    if (!isAlreadyActive && activeMemberCount >= FREE_MEMBER_LIMIT) {
      redirect(`/invites/${token}?error=limit-reached`);
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
      select: {
        id: true,
        role: true,
      },
    });

    if (existingMembership) {
      await tx.workspaceMember.update({
        where: {
          id: existingMembership.id,
        },
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
      where: {
        workspaceId: invite.workspaceId,
      },
      select: {
        id: true,
      },
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
      where: {
        id: invite.id,
      },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
  });

  revalidatePath(`/workspaces/${invite.workspaceId}`);
  revalidatePath(`/workspaces/${invite.workspaceId}/members`);
  revalidatePath(`/workspaces/${invite.workspaceId}/meetings`);
  for (const meetingId of meetingIds) {
    revalidatePath(`/workspaces/${invite.workspaceId}/meetings/${meetingId}`);
  }
  revalidatePath("/");

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

  redirect(`/workspaces/${invite.workspaceId}?workspace=${notificationStatus}`);
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

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.toLowerCase()).filter(Boolean)));
}
