CREATE TYPE "MeetingPermissionTargetType" AS ENUM (
  'SHARED_NOTES',
  'WHITEBOARD',
  'MICROPHONE',
  'CAMERA',
  'SCREEN_SHARE'
);

CREATE TYPE "MeetingPermissionState" AS ENUM (
  'ALLOWED',
  'DENIED',
  'REQUESTED'
);

CREATE TABLE "MeetingModerationSettings" (
  "meetingId" UUID NOT NULL,
  "sharedNotesDefaultEdit" BOOLEAN NOT NULL DEFAULT false,
  "whiteboardDefaultEdit" BOOLEAN NOT NULL DEFAULT false,
  "micDefaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cameraDefaultEnabled" BOOLEAN NOT NULL DEFAULT true,
  "screenShareDefaultEnabled" BOOLEAN NOT NULL DEFAULT false,
  "reactionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "handRaiseEnabled" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "MeetingModerationSettings_pkey" PRIMARY KEY ("meetingId")
);

CREATE TABLE "MeetingPermissionOverride" (
  "id" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "targetType" "MeetingPermissionTargetType" NOT NULL,
  "artifactId" UUID,
  "state" "MeetingPermissionState" NOT NULL,
  "grantedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MeetingPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingPermissionOverride_meetingId_userId_targetType_artifactId_key"
  ON "MeetingPermissionOverride"("meetingId", "userId", "targetType", "artifactId");

CREATE UNIQUE INDEX "MeetingPermissionOverride_meetingId_userId_targetType_null_artifact_key"
  ON "MeetingPermissionOverride"("meetingId", "userId", "targetType")
  WHERE "artifactId" IS NULL;

CREATE INDEX "MeetingPermissionOverride_meetingId_targetType_idx"
  ON "MeetingPermissionOverride"("meetingId", "targetType");

CREATE INDEX "MeetingPermissionOverride_userId_idx"
  ON "MeetingPermissionOverride"("userId");

ALTER TABLE "MeetingModerationSettings"
  ADD CONSTRAINT "MeetingModerationSettings_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetingPermissionOverride"
  ADD CONSTRAINT "MeetingPermissionOverride_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetingPermissionOverride"
  ADD CONSTRAINT "MeetingPermissionOverride_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MeetingPermissionOverride"
  ADD CONSTRAINT "MeetingPermissionOverride_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MeetingPermissionOverride"
  ADD CONSTRAINT "MeetingPermissionOverride_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "MeetingArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
