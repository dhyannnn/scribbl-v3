-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('GROUP', 'ONE_ON_ONE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CALL_INCOMING';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "type" "MeetingType" NOT NULL DEFAULT 'GROUP';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "calls" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PendingCall" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "callerId" UUID NOT NULL,
    "calleeId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingCall_meetingId_key" ON "PendingCall"("meetingId");

-- CreateIndex
CREATE INDEX "PendingCall_calleeId_idx" ON "PendingCall"("calleeId");

-- CreateIndex
CREATE INDEX "PendingCall_expiresAt_idx" ON "PendingCall"("expiresAt");

-- AddForeignKey
ALTER TABLE "PendingCall" ADD CONSTRAINT "PendingCall_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
