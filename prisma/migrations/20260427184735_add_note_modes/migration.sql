-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'WORKSPACE_SHARED');

-- CreateEnum
CREATE TYPE "NoteCollaborationMode" AS ENUM ('SOLO', 'COLLABORATIVE');

-- CreateEnum
CREATE TYPE "NoteSourceDevice" AS ENUM ('WEB', 'TABLET', 'IPAD', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "collaboration" "NoteCollaborationMode" NOT NULL DEFAULT 'SOLO',
ADD COLUMN     "sourceDevice" "NoteSourceDevice" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "visibility" "NoteVisibility" NOT NULL DEFAULT 'WORKSPACE_SHARED';
