"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAppUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/current-user";
import { sendWorkspaceInviteEmail } from "@/lib/email/workspace-invites";
import { prisma } from "@/lib/prisma";

const memberRoles = ["ADMIN", "MEMBER", "TUTOR", "PROFESSOR"] as const;
const workspaceTypes = ["COURSE", "STUDY_GROUP", "TUTORING_GROUP"] as const;

export async function updateWorkspaceDetails(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const typeValue = String(formData.get("type") ?? "STUDY_GROUP");
  const description = String(formData.get("description") ?? "").trim();

  if (!workspaceId || !name || !workspaceTypes.includes(typeValue as (typeof workspaceTypes)[number])) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: currentUser.id,
      },
    },
    select: {
      role: true,
      status: true,
    },
  });

  if (membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
    return;
  }

  await prisma.workspace.update({
    where: {
      id: workspaceId,
    },
    data: {
      name,
      type: typeValue as (typeof workspaceTypes)[number],
      description: description || null,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}?workspace=updated`);
}

export async function addWorkspaceMember(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleValue = String(formData.get("role") ?? "MEMBER");

  if (
    !workspaceId ||
    !email ||
    !email.includes("@") ||
    !memberRoles.includes(roleValue as (typeof memberRoles)[number])
  ) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/members?invite=invalid` : "/");
  }

  const role = roleValue as (typeof memberRoles)[number];

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!currentUser || !workspace) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/members?invite=invalid` : "/");
  }

  const currentMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: currentUser.id,
      },
    },
    select: {
      role: true,
      status: true,
    },
  });

  if (currentMembership?.role !== "OWNER" || currentMembership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspace.id}/members?invite=unauthorized`);
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    const existingMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: existingUser.id,
        },
      },
      select: {
        status: true,
      },
    });

    if (existingMembership?.status === "ACTIVE") {
      redirect(`/workspaces/${workspace.id}/members?invite=already-member`);
    }
  }

  const token = createInviteToken();
  const expiresAt = createInviteExpiry();
  const invite = await prisma.workspaceInvite.upsert({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email,
      },
    },
    update: {
      role,
      status: "PENDING",
      token,
      invitedByUserId: currentUser.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt,
    },
    create: {
      workspaceId: workspace.id,
      email,
      role,
      token,
      invitedByUserId: currentUser.id,
      expiresAt,
    },
    select: {
      token: true,
    },
  });

  const emailStatus = await sendInviteEmail({
    email,
    invitedByName: currentUser.displayName,
    inviteToken: invite.token,
    role,
    workspaceName: workspace.name,
  });

  revalidatePath(`/workspaces/${workspace.id}`);
  revalidatePath(`/workspaces/${workspace.id}/members`);
  revalidatePath("/");
  redirect(`/workspaces/${workspace.id}/members?invite=${emailStatus}`);
}

export async function removeWorkspaceMember(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");

  if (!workspaceId || !memberId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [currentMembership, membership] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
      },
      select: {
        id: true,
        role: true,
        status: true,
        workspaceId: true,
        userId: true,
      },
    }),
  ]);

  if (
    currentMembership?.role !== "OWNER" ||
    currentMembership.status !== "ACTIVE" ||
    !membership ||
    membership.status === "REMOVED"
  ) {
    return;
  }

  if (membership.role === "OWNER") {
    redirect(`/workspaces/${workspaceId}/members?invite=owner-removal-locked`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({
      where: {
        id: membership.id,
      },
      data: {
        status: "REMOVED",
      },
    });

    await tx.meetingParticipant.deleteMany({
      where: {
        userId: membership.userId,
        meeting: {
          workspaceId: membership.workspaceId,
        },
      },
    });
  });

  revalidatePath(`/workspaces/${membership.workspaceId}`);
  revalidatePath(`/workspaces/${membership.workspaceId}/members`);
  revalidatePath(`/workspaces/${membership.workspaceId}/meetings`);
  revalidatePath("/");
  redirect(`/workspaces/${membership.workspaceId}/members?invite=member-removed`);
}

export async function updateWorkspaceMemberRole(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const roleValue = String(formData.get("role") ?? "");

  if (!workspaceId || !memberId || !memberRoles.includes(roleValue as (typeof memberRoles)[number])) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/members?invite=invalid-role` : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [currentMembership, membership] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        role: true,
      },
    }),
  ]);

  if (currentMembership?.role !== "OWNER" || currentMembership.status !== "ACTIVE" || !membership) {
    redirect(`/workspaces/${workspaceId}/members?invite=unauthorized`);
  }

  if (membership.role === "OWNER") {
    redirect(`/workspaces/${workspaceId}/members?invite=owner-role-locked`);
  }

  await prisma.workspaceMember.update({
    where: {
      id: membership.id,
    },
    data: {
      role: roleValue as (typeof memberRoles)[number],
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/members`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/members?invite=role-updated`);
}

export async function revokeWorkspaceInvite(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");

  if (!workspaceId || !inviteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [currentMembership, invite] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (currentMembership?.role !== "OWNER" || currentMembership.status !== "ACTIVE" || !invite) {
    return;
  }

  await prisma.workspaceInvite.update({
    where: {
      id: invite.id,
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
    },
  });

  revalidatePath(`/workspaces/${workspaceId}/members`);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function resendWorkspaceInvite(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const inviteId = String(formData.get("inviteId") ?? "");

  if (!workspaceId || !inviteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [currentMembership, invite] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.workspaceInvite.findFirst({
      where: {
        id: inviteId,
        workspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
        email: true,
        role: true,
        workspace: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  if (currentMembership?.role !== "OWNER" || currentMembership.status !== "ACTIVE" || !invite) {
    return;
  }

  const token = createInviteToken();
  const expiresAt = createInviteExpiry();
  await prisma.workspaceInvite.update({
    where: {
      id: invite.id,
    },
    data: {
      token,
      expiresAt,
      revokedAt: null,
    },
  });

  const emailStatus = await sendInviteEmail({
    email: invite.email,
    invitedByName: currentUser.displayName,
    inviteToken: token,
    role: invite.role,
    workspaceName: invite.workspace.name,
  });

  revalidatePath(`/workspaces/${workspaceId}/members`);
  revalidatePath(`/workspaces/${workspaceId}`);
  redirect(`/workspaces/${workspaceId}/members?invite=${emailStatus}`);
}

function createInviteToken() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

function createInviteExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);
  return expiresAt;
}

async function sendInviteEmail({
  email,
  invitedByName,
  inviteToken,
  role,
  workspaceName,
}: {
  email: string;
  invitedByName: string;
  inviteToken: string;
  role: string;
  workspaceName: string;
}) {
  const result = await sendWorkspaceInviteEmail({
    email,
    invitedByName,
    inviteUrl: await createInviteUrl(inviteToken),
    role,
    workspaceName,
  });

  if (result.ok) {
    return "sent";
  }

  return result.reason === "not-configured" ? "email-not-configured" : "email-failed";
}

async function createInviteUrl(token: string) {
  return createAppUrl(`/invites/${token}`);
}
