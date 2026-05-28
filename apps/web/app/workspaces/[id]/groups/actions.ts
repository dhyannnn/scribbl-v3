"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { RateLimits } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function createGroup(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!workspaceId || !name) {
    redirect(`/workspaces/${workspaceId}/groups?group=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/groups`)}`);
  }

  const [membership, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true },
    }),
  ]);

  if (!membership || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (!workspace || workspace.plan === "FREE") {
    redirect(`/workspaces/${workspaceId}/groups?group=plan-limit`);
  }

  if (!RateLimits.groupCreate(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/groups?group=rate-limited`);
  }

  const group = await prisma.group.create({
    data: {
      workspaceId,
      name,
      description: description || null,
    },
    select: { id: true },
  });

  await writeAuditLog({
    action: "GROUP_CREATED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: group.id,
    metadata: { name },
  });

  revalidatePath(`/workspaces/${workspaceId}/groups`);
  redirect(`/workspaces/${workspaceId}/groups?group=created`);
}

export async function deleteGroup(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");

  if (!workspaceId || !groupId) {
    redirect(`/workspaces/${workspaceId}/groups?group=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/groups`)}`);
  }

  const [membership, group] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.group.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true, name: true },
    }),
  ]);

  if (!membership || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (!group) {
    redirect(`/workspaces/${workspaceId}/groups?group=not-found`);
  }

  if (!RateLimits.groupDelete(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/groups?group=rate-limited`);
  }

  await prisma.group.delete({ where: { id: groupId } });

  await writeAuditLog({
    action: "GROUP_DELETED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: groupId,
    metadata: { name: group.name },
  });

  revalidatePath(`/workspaces/${workspaceId}/groups`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  redirect(`/workspaces/${workspaceId}/groups?group=deleted`);
}

export async function addGroupMember(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!workspaceId || !groupId || !userId) {
    redirect(`/workspaces/${workspaceId}/groups?group=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/groups`)}`);
  }

  const [actorMembership, targetMembership, group] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { status: true },
    }),
    prisma.group.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true, name: true },
    }),
  ]);

  if (!actorMembership || actorMembership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (actorMembership.role !== "OWNER" && actorMembership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (!group) {
    redirect(`/workspaces/${workspaceId}/groups?group=not-found`);
  }

  if (!targetMembership || targetMembership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/groups?group=member-not-found`);
  }

  if (!RateLimits.groupMemberAdd(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/groups?group=rate-limited`);
  }

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId, userId } },
    update: {},
    create: { groupId, userId },
  });

  await writeAuditLog({
    action: "GROUP_MEMBER_ADDED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: groupId,
    metadata: { userId, groupName: group.name },
  });

  revalidatePath(`/workspaces/${workspaceId}/groups`);
  redirect(`/workspaces/${workspaceId}/groups?group=member-added`);
}

export async function removeGroupMember(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!workspaceId || !groupId || !userId) {
    redirect(`/workspaces/${workspaceId}/groups?group=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/groups`)}`);
  }

  const [actorMembership, group] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.group.findFirst({
      where: { id: groupId, workspaceId },
      select: { id: true, name: true },
    }),
  ]);

  if (!actorMembership || actorMembership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (actorMembership.role !== "OWNER" && actorMembership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/groups?group=unauthorized`);
  }

  if (!group) {
    redirect(`/workspaces/${workspaceId}/groups?group=not-found`);
  }

  if (!RateLimits.groupMemberRemove(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/groups?group=rate-limited`);
  }

  await prisma.groupMember.deleteMany({ where: { groupId, userId } });

  await writeAuditLog({
    action: "GROUP_MEMBER_REMOVED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: groupId,
    metadata: { userId, groupName: group.name },
  });

  revalidatePath(`/workspaces/${workspaceId}/groups`);
  redirect(`/workspaces/${workspaceId}/groups?group=member-removed`);
}
