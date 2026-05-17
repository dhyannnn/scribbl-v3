-- Add isPinned flag to File for surfacing pinned files in workspace chat sidebar
ALTER TABLE "File" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
