-- Message new columns
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "replyToId"        UUID REFERENCES "Message"("id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "attachmentFileId" UUID REFERENCES "File"("id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "isPinned"         BOOLEAN NOT NULL DEFAULT false;

-- ChannelType enum: add DIRECT
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'DIRECT';

-- MessageReaction table
CREATE TABLE IF NOT EXISTS "MessageReaction" (
  "id"        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID         NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE,
  "userId"    UUID         NOT NULL REFERENCES "User"("id")    ON DELETE CASCADE,
  "emoji"     TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("messageId", "userId", "emoji")
);

CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");
