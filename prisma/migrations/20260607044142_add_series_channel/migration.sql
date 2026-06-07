-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "seriesChannelId" UUID;

-- AlterTable
ALTER TABLE "NoteComment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "NoteSnapshot" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_seriesChannelId_fkey" FOREIGN KEY ("seriesChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
