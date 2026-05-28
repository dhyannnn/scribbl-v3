import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ notifications: [], soundEnabled: true }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  // On first load (no since param), fetch unread notifications from the last hour
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60 * 60 * 1000);

  const [notifications, preference] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: currentUser.id,
        readAt: null,
        createdAt: { gt: since },
      },
      select: {
        id: true,
        title: true,
        body: true,
        href: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.notificationPreference.findUnique({
      where: { userId: currentUser.id },
      select: { soundEnabled: true },
    }),
  ]);

  return NextResponse.json({
    notifications,
    soundEnabled: preference?.soundEnabled ?? true,
  });
}
