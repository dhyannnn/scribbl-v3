-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT_POSTED', 'CHAT_MESSAGE', 'MEETING_SCHEDULED', 'MEETING_UPDATED', 'MEETING_CANCELED', 'FILE_SHARED', 'NOTE_SHARED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "actorUserId" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "chatMessages" BOOLEAN NOT NULL DEFAULT false,
    "meetings" BOOLEAN NOT NULL DEFAULT true,
    "files" BOOLEAN NOT NULL DEFAULT true,
    "notes" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_createdAt_idx" ON "Notification"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default notification preferences for existing users.
INSERT INTO "NotificationPreference" ("id", "userId", "updatedAt")
SELECT gen_random_uuid(), "User"."id", NOW()
FROM "User"
WHERE NOT EXISTS (
  SELECT 1
  FROM "NotificationPreference"
  WHERE "NotificationPreference"."userId" = "User"."id"
);

-- Backfill an announcements channel for existing workspaces.
INSERT INTO "Channel" ("id", "workspaceId", "name", "type", "createdByUserId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "Workspace"."id", 'announcements', 'ANNOUNCEMENT', "Workspace"."createdByUserId", NOW(), NOW()
FROM "Workspace"
WHERE NOT EXISTS (
  SELECT 1
  FROM "Channel"
  WHERE "Channel"."workspaceId" = "Workspace"."id"
    AND "Channel"."type" = 'ANNOUNCEMENT'
);
