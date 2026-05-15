"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { cleanupUserNotifications, ensureNotificationPreference, notificationPreferenceDefaults } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function markNotificationRead(formData: FormData) {
  const notificationId = String(formData.get("notificationId") ?? "");
  const href = String(formData.get("href") ?? "/notifications");
  const currentUser = await getCurrentUser();

  if (!currentUser || !notificationId) {
    redirect("/notifications");
  }

  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId: currentUser.id,
    },
    data: {
      readAt: new Date(),
    },
  });
  await cleanupUserNotifications(currentUser.id);

  revalidatePath("/");
  revalidatePath("/notifications");
  redirect(isSafeHref(href) ? href : "/notifications");
}

export async function markAllNotificationsRead() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  await prisma.notification.updateMany({
    where: {
      userId: currentUser.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
  await cleanupUserNotifications(currentUser.id);

  revalidatePath("/");
  revalidatePath("/notifications");
}

export async function updateNotificationPreferences(formData: FormData) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login?next=/account");
  }

  await ensureNotificationPreference(currentUser.id);
  await prisma.notificationPreference.update({
    where: {
      userId: currentUser.id,
    },
    data: {
      ...notificationPreferenceDefaults,
      announcements: formData.get("announcements") === "on",
      chatMessages: formData.get("chatMessages") === "on",
      meetings: formData.get("meetings") === "on",
      files: formData.get("files") === "on",
      notes: formData.get("notes") === "on",
    },
  });

  revalidatePath("/account");
  redirect("/account?message=Notification preferences updated");
}

function isSafeHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return false;
  }

  try {
    const url = new URL(href, "http://scribbl.local");
    return url.origin === "http://scribbl.local";
  } catch {
    return false;
  }
}
