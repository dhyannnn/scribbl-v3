import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const results: Record<string, number> = {};

  // #20 — Delete expired pending calls
  const expiredCalls = await prisma.pendingCall.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  results.expiredCalls = expiredCalls.count;

  // #21 — Delete stale waiting room entries (no heartbeat in 5 min)
  const staleWaiting = await prisma.meetingWaitingUser.deleteMany({
    where: { lastHeartbeatAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
  });
  results.staleWaitingUsers = staleWaiting.count;

  // #22 — Mark crashed video sessions as disconnected (no update in 24h)
  const staleSessions = await prisma.meetingVideoSession.updateMany({
    where: {
      disconnectedAt: null,
      createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    data: { disconnectedAt: now },
  });
  results.staleSessions = staleSessions.count;

  // Expire pending workspace invites past their expiry date
  const expiredInvites = await prisma.workspaceInvite.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  results.expiredInvites = expiredInvites.count;

  // #28 — Delete notifications read more than 90 days ago
  const oldNotifications = await prisma.notification.deleteMany({
    where: { readAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } },
  });
  results.oldNotifications = oldNotifications.count;

  // #17 — Delete stale rate limit rows (older than 1 hour)
  await prisma.$executeRaw`
    DELETE FROM "RateLimitEntry" WHERE "windowStart" < ${new Date(now.getTime() - 60 * 60 * 1000)}
  `;

  // #34 — Delete audit log rows older than 1 year
  const oldAuditLogs = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } },
  });
  results.oldAuditLogs = oldAuditLogs.count;

  console.log("[cron]", results);
  return Response.json({ ok: true, results });
}
