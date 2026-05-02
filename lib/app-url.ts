import "server-only";

import { headers } from "next/headers";

export async function createAppUrl(path: string) {
  const requestHeaders = await headers();
  const configuredAppUrl = process.env.APP_URL;
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const host = requestHeaders.get("host");
  const origin = configuredAppUrl ?? (host ? `${forwardedProto ?? "http"}://${host}` : "http://localhost:3000");

  return new URL(path, origin).toString();
}
