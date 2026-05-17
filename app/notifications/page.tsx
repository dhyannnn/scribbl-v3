import Link from "next/link";
import { markAllNotificationsRead, markNotificationRead } from "./actions";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export default async function NotificationsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const notifications = await prisma.notification.findMany({
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
      workspace: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const unreadText = unreadCount === 1 ? "1 unread notification" : `${unreadCount} unread notifications`;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d8ce] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-medium text-[#2f604b]">
              Back to dashboard
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#171713] sm:text-3xl lg:text-4xl">Notifications</h1>
            <p className="mt-2 text-sm text-[#66685f]">{unreadText}</p>
          </div>
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <button className="rounded-md border border-[#c8c8bd] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                Mark all read
              </button>
            </form>
          ) : null}
        </header>

        <section className="rounded-md border border-[#d8d8ce] bg-white p-3 shadow-sm">
          <div className="grid gap-1">
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <form key={notification.id} action={markNotificationRead}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <input type="hidden" name="href" value={notification.href} />
                  <button className="w-full rounded-md px-4 py-3 text-left transition hover:bg-[#f4f4ef]">
                    <span className="flex items-start gap-3">
                      {!notification.readAt ? (
                        <span className="mt-2 size-2.5 shrink-0 rounded-full bg-[#2f604b]" aria-label="Unread" />
                      ) : (
                        <span className="w-2.5 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="mb-1 block text-xs font-semibold uppercase text-[#6d7f70]">
                          {getNotificationTypeLabel(notification.type)}
                        </span>
                        <span className="block font-semibold text-[#20201d]">{notification.title}</span>
                        {notification.body ? (
                          <span className="mt-1 block text-sm leading-6 text-[#66685f]">{notification.body}</span>
                        ) : null}
                        <span className="mt-2 block text-xs text-[#8a8c82]">
                          {notification.workspace?.name ? `${notification.workspace.name} / ` : ""}
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </form>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] px-4 py-3 text-sm text-[#66685f]">
                You do not have any notifications yet.
                Workspace announcements and meeting updates will appear here.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatNotificationTime(value: Date) {
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
