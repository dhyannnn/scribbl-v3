-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'BUSY', 'AWAY', 'IN_MEETING');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "previousStatus" "UserStatus",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ONLINE';
