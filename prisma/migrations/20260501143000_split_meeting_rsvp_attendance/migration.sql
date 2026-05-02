UPDATE "MeetingParticipant"
SET
  "status" = 'ACCEPTED',
  "joinedAt" = COALESCE("joinedAt", now())
WHERE "status" = 'JOINED';

UPDATE "MeetingParticipant"
SET "status" = 'DECLINED'
WHERE "status" = 'MISSED';
