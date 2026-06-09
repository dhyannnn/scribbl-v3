-- Tier 2 security & correctness fixes (Jun 8 2026)

-- #17: Postgres-backed rate limiter table
CREATE TABLE IF NOT EXISTS "RateLimitEntry" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitEntry_pkey" PRIMARY KEY ("key")
);

-- #14: Stripe webhook idempotency log
CREATE TABLE IF NOT EXISTS "StripeEventLog" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeEventLog_pkey" PRIMARY KEY ("eventId")
);

-- #18: DM channel unique constraint (normalize user ID order in application code)
CREATE UNIQUE INDEX IF NOT EXISTS "Channel_dmUser1Id_dmUser2Id_key" ON "Channel"("dmUser1Id", "dmUser2Id");

-- #27: Compound indexes for high-traffic queries
CREATE INDEX IF NOT EXISTS "Note_workspaceId_visibility_deletedAt_idx" ON "Note"("workspaceId", "visibility", "deletedAt");
CREATE INDEX IF NOT EXISTS "File_workspaceId_visibility_idx" ON "File"("workspaceId", "visibility");
