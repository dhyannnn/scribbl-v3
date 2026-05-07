/**
 * Validates that all required environment variables are present at startup.
 * Call this in instrumentation.ts or the root layout to catch misconfiguration early.
 */

const required = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "LIVEBLOCKS_SECRET_KEY",
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_URL",
  "SUPABASE_STORAGE_BUCKET",
  "RECORDINGS_S3_ENDPOINT",
  "RECORDINGS_S3_REGION",
  "RECORDINGS_S3_BUCKET",
  "RECORDINGS_S3_ACCESS_KEY",
  "RECORDINGS_S3_SECRET_KEY",
] as const;

export type EnvKey = (typeof required)[number];

export function validateEnv(): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

export function assertEnv(): void {
  const result = validateEnv();
  if (!result.ok) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(", ")}\n` +
        "Copy .env.example to .env and fill in all values.",
    );
  }
}
