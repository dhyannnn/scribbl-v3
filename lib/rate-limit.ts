import "server-only";

type RateLimitEntry = { count: number; resetAt: number };

// In-memory store — resets on server restart. Sufficient for a single-instance deployment.
const store = new Map<string, RateLimitEntry>();

/**
 * Returns true if the action is allowed, false if the limit is exceeded.
 * key     — unique string identifying the actor + action (e.g. "invite:userId")
 * limit   — max number of calls allowed within windowMs
 * windowMs — sliding window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}

// Pre-built rate limit configs for each sensitive action
export const RateLimits = {
  inviteCreate:      (userId: string) => checkRateLimit(`invite-create:${userId}`,   10, 60_000),
  inviteResend:      (userId: string) => checkRateLimit(`invite-resend:${userId}`,    5, 60_000),
  chatSend:          (userId: string) => checkRateLimit(`chat-send:${userId}`,       30, 60_000),
  recordingStart:    (userId: string) => checkRateLimit(`recording-start:${userId}`,  3, 60_000),
  recordingStop:     (userId: string) => checkRateLimit(`recording-stop:${userId}`,   5, 60_000),
  fileUpload:        (userId: string) => checkRateLimit(`file-upload:${userId}`,     20, 60_000),
  accountDelete:     (userId: string) => checkRateLimit(`account-delete:${userId}`,   3, 60 * 60_000),
  passwordUpdate:    (userId: string) => checkRateLimit(`password-update:${userId}`,  5, 60 * 60_000),
  meetingSchedule:   (userId: string) => checkRateLimit(`meeting-schedule:${userId}`,10, 60_000),
};
