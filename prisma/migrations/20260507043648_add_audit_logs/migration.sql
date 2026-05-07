-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ACCOUNT_DELETED', 'MEMBER_INVITED', 'MEMBER_INVITE_RESENT', 'MEMBER_INVITE_REVOKED', 'MEMBER_INVITE_ACCEPTED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'OWNERSHIP_TRANSFERRED', 'MEETING_SCHEDULED', 'MEETING_UPDATED', 'MEETING_CANCELED', 'RECORDING_STARTED', 'RECORDING_STOPPED', 'RECORDING_COMPLETED', 'RECORDING_FAILED', 'NOTE_DELETED', 'FILE_DELETED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorUserId" UUID,
    "workspaceId" UUID,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
