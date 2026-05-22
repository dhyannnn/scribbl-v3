-- Add DM participant fields to Channel
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "dmUser1Id" UUID REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "dmUser2Id" UUID REFERENCES "User"("id") ON DELETE SET NULL;

-- Unique index prevents duplicate DM threads between the same two users in a workspace
-- Partial index only applies when both participants are set (i.e. DIRECT channels)
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_workspaceId_dmUser1Id_dmUser2Id_key"
  ON "Channel"("workspaceId", "dmUser1Id", "dmUser2Id")
  WHERE "dmUser1Id" IS NOT NULL AND "dmUser2Id" IS NOT NULL;
