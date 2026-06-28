import { NextResponse } from "next/server";
import type { MobileNotificationsResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import { mobileUnauthorized } from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const now = new Date();
  const [invites, notifications] = await Promise.all([
    prisma.workspaceInvite.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: "PENDING",
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        workspace: { select: { name: true } },
        invitedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.notification.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
        workspace: { select: { name: true } },
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const response: MobileNotificationsResponse = {
    unattendedCount: invites.length,
    notifications: [
      ...invites.map((invite) => ({
        id: invite.id,
        kind: "workspace_invite" as const,
        type: "ANNOUNCEMENT_POSTED" as const,
        title: `Invite to ${invite.workspace.name}`,
        body: `${invite.invitedBy.displayName} invited you as ${invite.role.toLowerCase()}.`,
        href: `/invites/${invite.token}`,
        readAt: null,
        createdAt: invite.createdAt.toISOString(),
        workspaceName: invite.workspace.name,
        actorName: invite.invitedBy.displayName,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      })),
      ...notifications.map((notification) => ({
        id: notification.id,
        kind: "notification" as const,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
        workspaceName: notification.workspace?.name ?? null,
        actorName: notification.actor?.displayName ?? null,
      })),
    ],
  };

  return NextResponse.json(response);
}
