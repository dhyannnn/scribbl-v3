CREATE TYPE "MeetingArtifactSource" AS ENUM ('ATTACHED', 'CREATED_IN_MEETING');

ALTER TABLE "MeetingArtifact"
ADD COLUMN "source" "MeetingArtifactSource" NOT NULL DEFAULT 'ATTACHED';
