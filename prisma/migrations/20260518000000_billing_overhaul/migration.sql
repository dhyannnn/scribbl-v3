-- Add ENTERPRISE to SubscriptionPlan enum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'ENTERPRISE';

-- Add BILLING_OVERAGE_CHARGED to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_OVERAGE_CHARGED';

-- Add durationSeconds to MeetingRecording for overage billing
ALTER TABLE "MeetingRecording" ADD COLUMN "durationSeconds" INTEGER;

-- Add currentPeriodStart to Subscription for recording hour enforcement
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
