import Link from "next/link";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { NotificationDropdown } from "@/components/NotificationDropdown";

export async function NotificationBell() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return null;
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: currentUser.id,
      },
      select: {
        id: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
        type: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 6,
    }),
    prisma.notification.count({
      where: {
        userId: currentUser.id,
        readAt: null,
      },
    }),
  ]);

  return (
    <NotificationDropdown unreadCount={unreadCount}>
        <div className="flex items-center justify-between gap-3 border-b border-[#e6e6dc] pb-2">
          <p className="font-semibold text-[#20201d]">Notifications</p>
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <button className="text-xs font-medium text-[#2f604b]">Mark all read</button>
            </form>
          ) : null}
        </div>
        <div className="mt-2 grid gap-1">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <form key={notification.id} action={markNotificationRead}>
                <input type="hidden" name="notificationId" value={notification.id} />
                <input type="hidden" name="href" value={notification.href} />
                <button className="w-full rounded-md px-3 py-2 text-left transition hover:bg-[#f4f4ef]">
                  <span className="flex items-start gap-2">
                    {!notification.readAt ? (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#2f604b]" aria-label="Unread" />
                    ) : (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-transparent" />
                    )}
                    <span className="min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase text-[#6d7f70]">
                        {getNotificationTypeLabel(notification.type)}
                      </span>
                      <span className="block font-medium text-[#20201d]">{notification.title}</span>
                      {notification.body ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-[#66685f]">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[10px] text-[#8a8c82]">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </span>
                  </span>
                </button>
              </form>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] px-3 py-2 text-xs text-[#66685f]">
              No notifications yet.
            </p>
          )}
        </div>
        <Link href="/notifications" className="mt-3 block rounded-md border border-[#c8c8bd] px-3 py-2 text-center text-xs font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
          View all
        </Link>
    </NotificationDropdown>
  );
}

function formatNotificationTime(value: Date) {
  const elapsedMs = Date.now() - value.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < minuteMs) {
    return "Just now";
  }

  if (elapsedMs < hourMs) {
    const minutes = Math.max(1, Math.floor(elapsedMs / minuteMs));
    return `${minutes}m ago`;
  }

  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    return `${hours}h ago`;
  }

  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getNotificationTypeLabel(type: string) {
  switch (type) {
    case "ANNOUNCEMENT_POSTED":
      return "Announcement";
    case "CHAT_MESSAGE":
      return "Chat";
    case "MEETING_SCHEDULED":
    case "MEETING_UPDATED":
    case "MEETING_CANCELED":
      return "Meeting";
    case "FILE_SHARED":
      return "File";
    case "NOTE_SHARED":
      return "Note";
    default:
      return "Update";
  }
}
