-- CreateEnum
CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" UUID NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_workspaceId_email_key" ON "WorkspaceInvite"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_email_idx" ON "WorkspaceInvite"("email");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_workspaceId_status_idx" ON "WorkspaceInvite"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
