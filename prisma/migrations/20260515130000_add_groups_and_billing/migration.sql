-- Add SubscriptionPlan and SubscriptionStatus enums
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'INSTITUTION');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- Add plan and organizationId to Workspace
ALTER TABLE "Workspace" ADD COLUMN "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Workspace" ADD COLUMN "organizationId" UUID;

-- Add groupId to Meeting
ALTER TABLE "Meeting" ADD COLUMN "groupId" UUID;

-- Create Organization table
CREATE TABLE "Organization" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"             TEXT         NOT NULL,
  "ownerUserId"      UUID         NOT NULL,
  "stripeCustomerId" TEXT,
  "plan"             "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  "currentPeriodEnd" TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Create Subscription table
CREATE TABLE "Subscription" (
  "id"                   UUID               NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"          UUID,
  "organizationId"       UUID,
  "stripeCustomerId"     TEXT               NOT NULL,
  "stripeSubscriptionId" TEXT,
  "stripePriceId"        TEXT,
  "plan"                 "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  "status"               "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "currentPeriodEnd"     TIMESTAMP(3),
  "cancelAtPeriodEnd"    BOOLEAN            NOT NULL DEFAULT false,
  "createdAt"            TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- Create Group table
CREATE TABLE "Group" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- Create GroupMember table
CREATE TABLE "GroupMember" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "groupId"   UUID         NOT NULL,
  "userId"    UUID         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "Organization"  ADD CONSTRAINT "Organization_stripeCustomerId_key"    UNIQUE ("stripeCustomerId");
ALTER TABLE "Subscription"  ADD CONSTRAINT "Subscription_workspaceId_key"          UNIQUE ("workspaceId");
ALTER TABLE "Subscription"  ADD CONSTRAINT "Subscription_organizationId_key"       UNIQUE ("organizationId");
ALTER TABLE "Subscription"  ADD CONSTRAINT "Subscription_stripeCustomerId_key"     UNIQUE ("stripeCustomerId");
ALTER TABLE "Subscription"  ADD CONSTRAINT "Subscription_stripeSubscriptionId_key" UNIQUE ("stripeSubscriptionId");
ALTER TABLE "GroupMember"   ADD CONSTRAINT "GroupMember_groupId_userId_key"        UNIQUE ("groupId", "userId");

-- Indexes
CREATE INDEX "Organization_ownerUserId_idx"  ON "Organization"("ownerUserId");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Group_workspaceId_idx"         ON "Group"("workspaceId");
CREATE INDEX "GroupMember_userId_idx"        ON "GroupMember"("userId");
CREATE INDEX "GroupMember_groupId_idx"       ON "GroupMember"("groupId");
CREATE INDEX "Meeting_groupId_idx"           ON "Meeting"("groupId");
CREATE INDEX "Workspace_organizationId_idx"  ON "Workspace"("organizationId");

-- Foreign keys
ALTER TABLE "Workspace"    ADD CONSTRAINT "Workspace_organizationId_fkey"     FOREIGN KEY ("organizationId")  REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting"      ADD CONSTRAINT "Meeting_groupId_fkey"               FOREIGN KEY ("groupId")         REFERENCES "Group"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey"      FOREIGN KEY ("ownerUserId")     REFERENCES "User"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey"      FOREIGN KEY ("workspaceId")     REFERENCES "Workspace"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey"   FOREIGN KEY ("organizationId")  REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Group"        ADD CONSTRAINT "Group_workspaceId_fkey"              FOREIGN KEY ("workspaceId")     REFERENCES "Workspace"("id")    ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "GroupMember"  ADD CONSTRAINT "GroupMember_groupId_fkey"            FOREIGN KEY ("groupId")         REFERENCES "Group"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "GroupMember"  ADD CONSTRAINT "GroupMember_userId_fkey"             FOREIGN KEY ("userId")          REFERENCES "User"("id")         ON DELETE CASCADE  ON UPDATE CASCADE;
