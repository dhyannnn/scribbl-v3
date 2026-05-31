-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "waitingRoom" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MeetingAdmission" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingWaitingUser" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingWaitingUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingAdmission_meetingId_idx" ON "MeetingAdmission"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAdmission_meetingId_userId_key" ON "MeetingAdmission"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingWaitingUser_meetingId_idx" ON "MeetingWaitingUser"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingWaitingUser_meetingId_userId_key" ON "MeetingWaitingUser"("meetingId", "userId");

-- AddForeignKey
ALTER TABLE "MeetingAdmission" ADD CONSTRAINT "MeetingAdmission_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingWaitingUser" ADD CONSTRAINT "MeetingWaitingUser_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
