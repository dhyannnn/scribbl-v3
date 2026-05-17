-- Rename WorkspaceType enum values to generic names
-- COURSE → CLASS, STUDY_GROUP → TEAM, TUTORING_GROUP → PROJECT
-- ALTER TYPE ... RENAME VALUE is supported in PostgreSQL 10+ (Supabase uses PG 15)
ALTER TYPE "WorkspaceType" RENAME VALUE 'COURSE' TO 'CLASS';
ALTER TYPE "WorkspaceType" RENAME VALUE 'STUDY_GROUP' TO 'TEAM';
ALTER TYPE "WorkspaceType" RENAME VALUE 'TUTORING_GROUP' TO 'PROJECT';

-- Remove TUTOR and PROFESSOR from WorkspaceRole
-- First downgrade any existing members/invites with those roles to MEMBER
UPDATE "WorkspaceMember" SET "role" = 'MEMBER' WHERE "role" IN ('TUTOR', 'PROFESSOR');
UPDATE "WorkspaceInvite" SET "role" = 'MEMBER' WHERE "role" IN ('TUTOR', 'PROFESSOR');

-- Recreate WorkspaceRole without TUTOR/PROFESSOR
-- (PostgreSQL does not support DROP VALUE on enums directly)
CREATE TYPE "WorkspaceRole_new" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

ALTER TABLE "WorkspaceMember"
  ALTER COLUMN "role" TYPE "WorkspaceRole_new"
  USING "role"::text::"WorkspaceRole_new";

ALTER TABLE "WorkspaceInvite"
  ALTER COLUMN "role" TYPE "WorkspaceRole_new"
  USING "role"::text::"WorkspaceRole_new";

DROP TYPE "WorkspaceRole";
ALTER TYPE "WorkspaceRole_new" RENAME TO "WorkspaceRole";
