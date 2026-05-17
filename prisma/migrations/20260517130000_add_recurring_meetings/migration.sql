-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "seriesId" UUID;
ALTER TABLE "Meeting" ADD COLUMN "recurrence" "RecurrenceFrequency";
ALTER TABLE "Meeting" ADD COLUMN "seriesIndex" INTEGER;
ALTER TABLE "Meeting" ADD COLUMN "recurrenceEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Meeting_seriesId_idx" ON "Meeting"("seriesId");
