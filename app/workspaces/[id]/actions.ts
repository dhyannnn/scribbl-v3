"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { broadcastWorkspaceKick } from "@/lib/liveblocks-kick";
import { createAppUrl } from "@/lib/app-url";
import { FREE_MEMBER_LIMIT } from "@/lib/billing";
import { RateLimits } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/current-user";
import { sendWorkspaceInviteEmail } from "@/lib/email/workspace-invites";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createAdminClient, getStorageBucketName } from "@/lib/supabase/admin";

const memberRoles = ["ADMIN", "MEMBER"] as const;
const workspaceTypes = ["TEAM", "PROJECT", "CLASS"] as const;

export async function updateWorkspaceDetails(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const typeValue = String(formData.get("type") ?? "TEAM");
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

  // Plan check before rate limit — Free workspaces have a hard member cap; paid plans bill overages.
  // Count both ACTIVE and INVITED members so pending invites are included in the cap —
  // otherwise multiple invites can be sent against the same slot and all bounce at acceptance.
  const [workspacePlan, effectiveMemberCount] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspace.id }, select: { plan: true } }),
    prisma.workspaceMember.count({
      where: { workspaceId: workspace.id, status: { in: ["ACTIVE", "INVITED"] } },
    }),
  ]);
  if (workspacePlan?.plan === "FREE" && effectiveMemberCount >= FREE_MEMBER_LIMIT) {
    redirect(`/workspaces/${workspace.id}/members?invite=plan-limit`);
  }

  if (!await RateLimits.inviteCreate(currentUser.id)) {
    redirect(`/workspaces/${workspace.id}/members?invite=rate-limited`);
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

  await writeAuditLog({
    action: "MEMBER_INVITED",
    actorUserId: currentUser.id,
    workspaceId: workspace.id,
    targetId: invite.token,
    metadata: { email, role },
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

  await writeAuditLog({
    action: "MEMBER_REMOVED",
    actorUserId: currentUser.id,
    workspaceId: membership.workspaceId,
    targetId: membership.userId,
  });

  void broadcastWorkspaceKick(membership.workspaceId, membership.userId).catch(console.error);

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

  await writeAuditLog({
    action: "MEMBER_ROLE_CHANGED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: membership.id,
    metadata: { previousRole: membership.role, newRole: roleValue },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/members`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/members?invite=role-updated`);
}

export async function transferWorkspaceOwnership(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (!workspaceId || !memberId || confirmation !== "TRANSFER") {
    redirect(workspaceId ? `/workspaces/${workspaceId}/members?invite=transfer-confirmation-required` : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/workspaces/${workspaceId}/members?invite=unauthorized`);
  }

  const [currentMembership, nextOwnerMembership] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        id: true,
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
        userId: true,
      },
    }),
  ]);

  if (currentMembership?.role !== "OWNER" || currentMembership.status !== "ACTIVE" || !nextOwnerMembership) {
    redirect(`/workspaces/${workspaceId}/members?invite=unauthorized`);
  }

  if (nextOwnerMembership.role === "OWNER" || nextOwnerMembership.userId === currentUser.id) {
    redirect(`/workspaces/${workspaceId}/members?invite=transfer-invalid`);
  }

  await prisma.$transaction([
    prisma.workspaceMember.update({
      where: {
        id: currentMembership.id,
      },
      data: {
        role: "ADMIN",
      },
    }),
    prisma.workspaceMember.update({
      where: {
        id: nextOwnerMembership.id,
      },
      data: {
        role: "OWNER",
      },
    }),
    prisma.workspace.update({
      where: {
        id: workspaceId,
      },
      data: {
        createdByUserId: nextOwnerMembership.userId,
      },
    }),
  ]);

  await writeAuditLog({
    action: "OWNERSHIP_TRANSFERRED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: nextOwnerMembership.userId,
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/members`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/members?invite=ownership-transferred`);
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

  await writeAuditLog({
    action: "MEMBER_INVITE_REVOKED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: invite.id,
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

  if (!await RateLimits.inviteResend(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/members?invite=rate-limited`);
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

  await writeAuditLog({
    action: "MEMBER_INVITE_RESENT",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role },
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

export async function deleteWorkspace(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const confirmName = String(formData.get("confirmName") ?? "").trim();

  if (!workspaceId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [workspace, membership] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        subscription: {
          select: { stripeSubscriptionId: true },
        },
      },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
  ]);

  if (!workspace || membership?.role !== "OWNER" || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}?workspace=delete-unauthorized`);
  }

  // Require the owner to type the workspace name to confirm
  if (confirmName !== workspace.name) {
    redirect(`/workspaces/${workspaceId}?workspace=delete-name-mismatch`);
  }

  // Cancel active Stripe subscription so billing stops immediately
  if (workspace.subscription?.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(workspace.subscription.stripeSubscriptionId);
    } catch {
      console.error("[deleteWorkspace] failed to cancel Stripe subscription for", workspaceId);
    }
  }

  // Delete all storage objects before deleting the workspace record.
  // Files have onDelete:SetNull so they'd become orphaned otherwise.
  const files = await prisma.file.findMany({
    where: { workspaceId },
    select: { storageKey: true, storageBucket: true },
  });

  if (files.length > 0) {
    const supabase = createAdminClient();
    const defaultBucket = getStorageBucketName();
    const recordingsBucket = process.env.RECORDINGS_S3_BUCKET;

    // Partition: Supabase Storage files can be deleted via the admin client.
    // Recording files live in an external S3 bucket and need a separate S3 client
    // (AWS SDK not installed). Their DB records are deleted below but the S3
    // objects are left — a background cleanup job is needed to handle those.
    const supabaseKeys = new Map<string, string[]>();
    for (const file of files) {
      const bucket = file.storageBucket ?? defaultBucket;
      if (recordingsBucket && bucket === recordingsBucket) continue;
      const keys = supabaseKeys.get(bucket) ?? [];
      keys.push(file.storageKey);
      supabaseKeys.set(bucket, keys);
    }

    await Promise.all(
      [...supabaseKeys.entries()].map(([bucket, keys]) =>
        supabase.storage.from(bucket).remove(keys)
      )
    );

    await prisma.file.deleteMany({ where: { workspaceId } });
  }

  await prisma.workspace.delete({ where: { id: workspaceId } });

  void writeAuditLog({
    action: "ACCOUNT_DELETED",
    actorUserId: currentUser.id,
    metadata: { workspaceId, workspaceName: workspace.name, type: "workspace" },
  });

  revalidatePath("/");
  redirect("/?workspace=deleted");
}
