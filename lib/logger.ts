type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function log(level: LogLevel, message: string, context?: LogContext, err?: unknown) {
  const entry = {
    level,
    message,
    ...(context ?? {}),
    ...(err instanceof Error
      ? { errorMessage: err.message, errorStack: err.stack }
      : err != null
        ? { error: String(err) }
        : {}),
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext, err?: unknown) => log("error", message, context, err),

  resendError: (context: LogContext, err?: unknown) =>
    log("error", "[resend] Email delivery failed", context, err),

  livekitError: (context: LogContext, err?: unknown) =>
    log("error", "[livekit] LiveKit operation failed", context, err),

  supabaseStorageError: (context: LogContext, err?: unknown) =>
    log("error", "[supabase-storage] Storage operation failed", context, err),

  dbError: (context: LogContext, err?: unknown) =>
    log("error", "[db] Database operation failed", context, err),

  accountDeletionError: (context: LogContext, err?: unknown) =>
    log("error", "[account-deletion] Auth cleanup failed", context, err),
};
