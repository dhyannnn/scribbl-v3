ALTER TABLE "MeetingParticipant"
ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "MeetingParticipantStatus_new" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED');

ALTER TABLE "MeetingParticipant"
ALTER COLUMN "status" TYPE "MeetingParticipantStatus_new"
USING ("status"::text::"MeetingParticipantStatus_new");

ALTER TYPE "MeetingParticipantStatus" RENAME TO "MeetingParticipantStatus_old";
ALTER TYPE "MeetingParticipantStatus_new" RENAME TO "MeetingParticipantStatus";
DROP TYPE "MeetingParticipantStatus_old";

ALTER TABLE "MeetingParticipant"
ALTER COLUMN "status" SET DEFAULT 'INVITED';
