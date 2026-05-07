CREATE TYPE "MeetingRecordingStatus" AS ENUM ('STARTING', 'ACTIVE', 'STOPPING', 'COMPLETED', 'FAILED');

ALTER TABLE "File"
ADD COLUMN "storageBucket" TEXT;

CREATE TABLE "MeetingRecording" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "egressId" TEXT NOT NULL,
    "status" "MeetingRecordingStatus" NOT NULL DEFAULT 'STARTING',
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileId" UUID,
    "startedByUserId" UUID NOT NULL,
    "stoppedByUserId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingRecording_egressId_key" ON "MeetingRecording"("egressId");
CREATE UNIQUE INDEX "MeetingRecording_fileId_key" ON "MeetingRecording"("fileId");
CREATE UNIQUE INDEX "MeetingRecording_one_active_meeting_key" ON "MeetingRecording"("meetingId") WHERE "status" IN ('STARTING', 'ACTIVE', 'STOPPING');
CREATE INDEX "MeetingRecording_meetingId_status_idx" ON "MeetingRecording"("meetingId", "status");
CREATE INDEX "MeetingRecording_startedByUserId_idx" ON "MeetingRecording"("startedByUserId");
CREATE INDEX "MeetingRecording_stoppedByUserId_idx" ON "MeetingRecording"("stoppedByUserId");

ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_stoppedByUserId_fkey" FOREIGN KEY ("stoppedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
