ALTER TABLE "Meeting"
ADD COLUMN "canceledAt" TIMESTAMP(3),
ADD COLUMN "canceledByUserId" UUID,
ADD COLUMN "cancellationReason" TEXT;
