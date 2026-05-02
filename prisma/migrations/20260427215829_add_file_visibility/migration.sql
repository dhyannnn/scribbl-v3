-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('PRIVATE', 'WORKSPACE_SHARED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "visibility" "FileVisibility" NOT NULL DEFAULT 'WORKSPACE_SHARED';
