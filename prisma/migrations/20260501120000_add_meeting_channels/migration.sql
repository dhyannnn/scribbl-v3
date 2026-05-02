ALTER TABLE "Channel" ADD COLUMN "meetingId" UUID;

CREATE UNIQUE INDEX "Channel_meetingId_key" ON "Channel"("meetingId");

ALTER TABLE "Channel"
ADD CONSTRAINT "Channel_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Channel" ("id", "workspaceId", "meetingId", "name", "type", "createdByUserId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  "Meeting"."workspaceId",
  "Meeting"."id",
  'Meeting: ' || "Meeting"."title",
  'CHAT',
  "Meeting"."createdByUserId",
  "Meeting"."createdAt",
  NOW()
FROM "Meeting"
WHERE "Meeting"."workspaceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Channel"
    WHERE "Channel"."meetingId" = "Meeting"."id"
  );
