CREATE TABLE "MeetingVideoSession" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingVideoSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingVideoSession_meetingId_userId_clientSessionId_key" ON "MeetingVideoSession"("meetingId", "userId", "clientSessionId");
CREATE UNIQUE INDEX "MeetingVideoSession_one_active_user_meeting_key" ON "MeetingVideoSession"("meetingId", "userId") WHERE "disconnectedAt" IS NULL;
CREATE INDEX "MeetingVideoSession_meetingId_userId_disconnectedAt_idx" ON "MeetingVideoSession"("meetingId", "userId", "disconnectedAt");
CREATE INDEX "MeetingVideoSession_userId_idx" ON "MeetingVideoSession"("userId");

ALTER TABLE "MeetingVideoSession" ADD CONSTRAINT "MeetingVideoSession_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingVideoSession" ADD CONSTRAINT "MeetingVideoSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
