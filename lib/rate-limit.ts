import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Postgres-backed rate limiter. Survives deploys and works across multiple instances.
 * Returns true if the action is allowed, false if the limit is exceeded.
 *
 * key      — unique string identifying the actor + action (e.g. "invite:userId")
 * limit    — max number of calls allowed within windowMs
 * windowMs — fixed window duration in milliseconds
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const result = await prisma.$queryRaw<{ count: bigint }[]>`
    INSERT INTO "RateLimitEntry" (key, count, "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE
      SET
        count        = CASE
                         WHEN "RateLimitEntry"."windowStart" < ${windowStart}
                         THEN 1
                         ELSE "RateLimitEntry".count + 1
                       END,
        "windowStart" = CASE
                         WHEN "RateLimitEntry"."windowStart" < ${windowStart}
                         THEN ${now}
                         ELSE "RateLimitEntry"."windowStart"
                       END
    RETURNING count
  `;

  const count = Number(result[0]?.count ?? 1);
  return count <= limit;
}

// Pre-built rate limit configs for each sensitive action
export const RateLimits = {
  inviteCreate:      (userId: string) => checkRateLimit(`invite-create:${userId}`,       10, 60_000),
  inviteResend:      (userId: string) => checkRateLimit(`invite-resend:${userId}`,         5, 60_000),
  chatSend:          (userId: string) => checkRateLimit(`chat-send:${userId}`,            30, 60_000),
  recordingStart:    (userId: string) => checkRateLimit(`recording-start:${userId}`,       3, 60_000),
  recordingStop:     (userId: string) => checkRateLimit(`recording-stop:${userId}`,        5, 60_000),
  fileUpload:        (userId: string) => checkRateLimit(`file-upload:${userId}`,          20, 60_000),
  accountDelete:     (userId: string) => checkRateLimit(`account-delete:${userId}`,        3, 60 * 60_000),
  passwordUpdate:    (userId: string) => checkRateLimit(`password-update:${userId}`,       5, 60 * 60_000),
  meetingSchedule:   (userId: string) => checkRateLimit(`meeting-schedule:${userId}`,     10, 60_000),
  handRaise:         (userId: string) => checkRateLimit(`hand-raise:${userId}`,            5, 60_000),
  channelCreate:     (userId: string) => checkRateLimit(`channel-create:${userId}`,        5, 60_000),
  channelDelete:     (userId: string) => checkRateLimit(`channel-delete:${userId}`,        5, 60_000),
  groupCreate:       (userId: string) => checkRateLimit(`group-create:${userId}`,         10, 60_000),
  groupDelete:       (userId: string) => checkRateLimit(`group-delete:${userId}`,         10, 60_000),
  groupMemberAdd:    (userId: string) => checkRateLimit(`group-member-add:${userId}`,     30, 60_000),
  groupMemberRemove: (userId: string) => checkRateLimit(`group-member-remove:${userId}`,  30, 60_000),
};
