import "server-only";

import type { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ActivityItem = {
  id: string;
  icon: "note" | "meeting" | "file" | "member" | "recording" | "group" | "billing";
  label: string;
  workspaceName: string;
  workspaceId: string;
  href: string;
  createdAt: Date;
};

const ACTIVITY_ACTIONS: AuditAction[] = [
  "MEMBER_INVITE_ACCEPTED",
  "MEETING_SCHEDULED",
  "MEETING_CANCELED",
  "NOTE_DELETED",
  "FILE_DELETED",
  "RECORDING_COMPLETED",
  "GROUP_CREATED",
  "GROUP_DELETED",
  "BILLING_UPGRADED",
];

export async function getWorkspaceActivity(
  workspaceIds: string[],
  limit = 20,
): Promise<ActivityItem[]> {
  if (workspaceIds.length === 0) return [];

  const logs = await prisma.auditLog.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      action: { in: ACTIVITY_ACTIONS },
    },
    select: {
      id: true,
      action: true,
      workspaceId: true,
      actorUserId: true,
      targetId: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: { displayName: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (logs.length === 0) return [];

  const uniqueWorkspaceIds = Array.from(new Set(logs.map((l) => l.workspaceId).filter(Boolean))) as string[];
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: uniqueWorkspaceIds } },
    select: { id: true, name: true },
  });
  const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));

  return logs.flatMap((log) => {
    const workspace = log.workspaceId ? workspaceMap.get(log.workspaceId) : null;
    if (!workspace) return [];

    const actor = log.actor?.displayName ?? "Someone";
    const meta = (log.metadata ?? {}) as Record<string, string>;
    const item = buildActivityItem(log.action, actor, meta, workspace, log);
    return item ? [item] : [];
  });
}

function buildActivityItem(
  action: string,
  actor: string,
  meta: Record<string, string>,
  workspace: { id: string; name: string },
  log: { id: string; targetId: string | null; createdAt: Date },
): ActivityItem | null {
  const base = {
    id: log.id,
    workspaceName: workspace.name,
    workspaceId: workspace.id,
    createdAt: log.createdAt,
  };

  switch (action) {
    case "MEMBER_INVITE_ACCEPTED":
      return {
        ...base,
        icon: "member",
        label: `${actor} joined ${workspace.name}`,
        href: `/workspaces/${workspace.id}/members`,
      };

    case "MEETING_SCHEDULED":
      return {
        ...base,
        icon: "meeting",
        label: `${actor} scheduled ${meta.title ?? "a meeting"}`,
        href: log.targetId
          ? `/workspaces/${workspace.id}/meetings/${log.targetId}`
          : `/workspaces/${workspace.id}/meetings`,
      };

    case "MEETING_CANCELED":
      return {
        ...base,
        icon: "meeting",
        label: `${actor} canceled ${meta.title ?? "a meeting"}`,
        href: log.targetId
          ? `/workspaces/${workspace.id}/meetings/${log.targetId}`
          : `/workspaces/${workspace.id}/meetings`,
      };

    case "NOTE_DELETED":
      return {
        ...base,
        icon: "note",
        label: `${actor} deleted a note`,
        href: `/workspaces/${workspace.id}/notes`,
      };

    case "FILE_DELETED":
      return {
        ...base,
        icon: "file",
        label: `${actor} deleted ${meta.name ?? "a file"}`,
        href: `/workspaces/${workspace.id}/files`,
      };

    case "RECORDING_COMPLETED":
      return {
        ...base,
        icon: "recording",
        label: `A recording was saved in ${workspace.name}`,
        href: `/workspaces/${workspace.id}/files`,
      };

    case "GROUP_CREATED":
      return {
        ...base,
        icon: "group",
        label: `${actor} created group ${meta.name ?? ""}`,
        href: `/workspaces/${workspace.id}/groups`,
      };

    case "GROUP_DELETED":
      return {
        ...base,
        icon: "group",
        label: `${actor} deleted group ${meta.name ?? ""}`,
        href: `/workspaces/${workspace.id}/groups`,
      };

    case "BILLING_UPGRADED":
      return {
        ...base,
        icon: "billing",
        label: `${workspace.name} upgraded to ${meta.newPlan ?? "Pro"}`,
        href: `/workspaces/${workspace.id}/billing`,
      };

    default:
      return null;
  }
}
