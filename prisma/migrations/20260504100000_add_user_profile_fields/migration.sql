CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'EDUCATOR', 'ADMIN');

ALTER TABLE "User"
  ADD COLUMN "authUserId" TEXT,
  ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'STUDENT';

UPDATE "User"
SET
  "firstName" = split_part(trim("displayName"), ' ', 1),
  "lastName" = CASE
    WHEN position(' ' in trim("displayName")) > 0 THEN substring(trim("displayName") from position(' ' in trim("displayName")) + 1)
    ELSE ''
  END
WHERE trim("displayName") <> '';

CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

ALTER TABLE "Workspace" DROP CONSTRAINT "Workspace_createdByUserId_fkey";
ALTER TABLE "WorkspaceInvite" DROP CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey";
ALTER TABLE "Channel" DROP CONSTRAINT "Channel_createdByUserId_fkey";
ALTER TABLE "Message" DROP CONSTRAINT "Message_senderUserId_fkey";
ALTER TABLE "Note" DROP CONSTRAINT "Note_ownerUserId_fkey";
ALTER TABLE "File" DROP CONSTRAINT "File_uploadedByUserId_fkey";
ALTER TABLE "Meeting" DROP CONSTRAINT "Meeting_createdByUserId_fkey";
ALTER TABLE "MeetingArtifact" DROP CONSTRAINT "MeetingArtifact_createdByUserId_fkey";

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
