import "server-only";

import type { AuditAction } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog({
  action,
  actorUserId,
  workspaceId,
  targetId,
  metadata,
}: {
  action: AuditAction;
  actorUserId?: string | null;
  workspaceId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        actorUserId: actorUserId ?? null,
        workspaceId: workspaceId ?? null,
        targetId: targetId ?? null,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });
  } catch (err) {
    // Audit log failures must never break the primary action
    logger.dbError({ action, actorUserId, workspaceId, targetId }, err);
  }
}
