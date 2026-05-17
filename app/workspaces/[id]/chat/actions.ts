"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";

const MAX_CHANNELS_PER_WORKSPACE = 20;

export async function createChannel(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const rawName = String(formData.get("name") ?? "").trim().toLowerCase();
  const name = rawName.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);

  if (!workspaceId || !name) {
    redirect(`/workspaces/${workspaceId}/chat?chat=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/chat`)}`);
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/chat?chat=unauthorized`);
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/chat?chat=unauthorized`);
  }

  if (!RateLimits.channelCreate(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/chat?chat=rate-limited`);
  }

  const [existingCount, duplicate] = await Promise.all([
    prisma.channel.count({ where: { workspaceId, meetingId: null } }),
    prisma.channel.findFirst({ where: { workspaceId, name, meetingId: null }, select: { id: true } }),
  ]);

  if (existingCount >= MAX_CHANNELS_PER_WORKSPACE) {
    redirect(`/workspaces/${workspaceId}/chat?chat=limit`);
  }

  if (duplicate) {
    redirect(`/workspaces/${workspaceId}/chat/${duplicate.id}?chat=duplicate`);
  }

  const channel = await prisma.channel.create({
    data: { workspaceId, name, type: "CHAT", createdByUserId: currentUser.id },
    select: { id: true },
  });

  revalidatePath(`/workspaces/${workspaceId}/chat`);
  redirect(`/workspaces/${workspaceId}/chat/${channel.id}`);
}

export async function deleteChannel(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");

  if (!workspaceId || !channelId) {
    redirect(`/workspaces/${workspaceId}/chat?chat=invalid`);
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/chat`)}`);
  }

  const [membership, channel] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.channel.findFirst({
      where: { id: channelId, workspaceId, meetingId: null },
      select: { id: true, type: true },
    }),
  ]);

  if (!membership || membership.status !== "ACTIVE" || !channel) {
    redirect(`/workspaces/${workspaceId}/chat?chat=unauthorized`);
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    redirect(`/workspaces/${workspaceId}/chat?chat=unauthorized`);
  }

  // Protect the last CHAT channel
  if (channel.type === "CHAT") {
    const chatCount = await prisma.channel.count({
      where: { workspaceId, type: "CHAT", meetingId: null },
    });
    if (chatCount <= 1) {
      redirect(`/workspaces/${workspaceId}/chat/${channelId}?chat=last-channel`);
    }
  }

  if (!RateLimits.channelDelete(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/chat?chat=rate-limited`);
  }

  await prisma.channel.delete({ where: { id: channelId } });

  const fallback = await prisma.channel.findFirst({
    where: { workspaceId, type: "CHAT", meetingId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  revalidatePath(`/workspaces/${workspaceId}/chat`);
  redirect(
    fallback
      ? `/workspaces/${workspaceId}/chat/${fallback.id}?chat=deleted`
      : `/workspaces/${workspaceId}?chat=deleted`,
  );
}

export async function sendMessage(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const returnTo = getSafeReturnTo(workspaceId, formData);

  if (!workspaceId || !channelId || !body) {
    redirect(workspaceId ? getChatRedirectPath(workspaceId, channelId, "invalid", returnTo) : "/");
  }

  const [currentUser, channel] = await Promise.all([
    getCurrentUser(),
    prisma.channel.findFirst({
      where: {
        id: channelId,
        workspaceId,
      },
      select: {
        id: true,
        workspace: {
          select: {
            members: {
              where: {
                status: "ACTIVE",
              },
              select: {
                userId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!currentUser || !channel || !channel.workspace.members.some((member) => member.userId === currentUser.id)) {
    redirect(getChatRedirectPath(workspaceId, channelId, "unauthorized", returnTo));
  }

  await prisma.message.create({
    data: {
      channelId: channel.id,
      senderUserId: currentUser.id,
      body,
    },
  });

  revalidateChatPaths(workspaceId, channel.id, returnTo);
  redirect(getChatRedirectPath(workspaceId, channel.id, "sent", returnTo));
}

export async function updateMessage(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const returnTo = getSafeReturnTo(workspaceId, formData);

  if (!workspaceId || !messageId || !body) {
    redirect(workspaceId ? getChatRedirectPath(workspaceId, "", "invalid", returnTo) : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/chat`)}`);
  }

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      senderUserId: currentUser.id,
      deletedAt: null,
      channel: {
        workspaceId,
        workspace: {
          members: {
            some: {
              userId: currentUser.id,
              status: "ACTIVE",
            },
          },
        },
      },
    },
    select: {
      id: true,
      channelId: true,
    },
  });

  if (!message) {
    redirect(getChatRedirectPath(workspaceId, "", "unauthorized", returnTo));
  }

  await prisma.message.update({
    where: {
      id: message.id,
    },
    data: {
      body,
      editedAt: new Date(),
    },
  });

  revalidateChatPaths(workspaceId, message.channelId, returnTo);
  redirect(getChatRedirectPath(workspaceId, message.channelId, "updated", returnTo));
}

export async function deleteMessage(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const returnTo = getSafeReturnTo(workspaceId, formData);

  if (!workspaceId || !messageId) {
    redirect(workspaceId ? getChatRedirectPath(workspaceId, "", "invalid", returnTo) : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/chat`)}`);
  }

  const [membership, message] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: currentUser.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    prisma.message.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        channel: {
          workspaceId,
        },
      },
      select: {
        id: true,
        channelId: true,
        senderUserId: true,
      },
    }),
  ]);

  const canModerate = membership?.role === "OWNER" || membership?.role === "ADMIN";

  if (membership?.status !== "ACTIVE" || !message || (message.senderUserId !== currentUser.id && !canModerate)) {
    redirect(getChatRedirectPath(workspaceId, "", "unauthorized", returnTo));
  }

  await prisma.message.update({
    where: {
      id: message.id,
    },
    data: {
      deletedAt: new Date(),
    },
  });

  revalidateChatPaths(workspaceId, message.channelId, returnTo);
  redirect(getChatRedirectPath(workspaceId, message.channelId, "deleted", returnTo));
}

function getChatRedirectPath(workspaceId: string, channelId: string, status: string, returnTo?: string) {
  if (returnTo) {
    const [pathAndQuery, hash] = returnTo.split("#");
    const separator = pathAndQuery.includes("?") ? "&" : "?";
    return `${pathAndQuery}${separator}chat=${status}${hash ? `#${hash}` : ""}`;
  }

  if (channelId) {
    return `/workspaces/${workspaceId}/chat/${channelId}?chat=${status}`;
  }

  return `/workspaces/${workspaceId}/chat?chat=${status}`;
}

function revalidateChatPaths(workspaceId: string, channelId: string, returnTo?: string) {
  revalidatePath(`/workspaces/${workspaceId}/chat`);
  if (channelId) {
    revalidatePath(`/workspaces/${workspaceId}/chat/${channelId}`);
  }
  revalidatePath(`/workspaces/${workspaceId}`);
  if (returnTo) {
    revalidatePath(returnTo.split(/[?#]/)[0]);
  }
  revalidatePath("/");
}

function getSafeReturnTo(workspaceId: string, formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "");

  if (!workspaceId || !returnTo.startsWith(`/workspaces/${workspaceId}/`)) {
    return undefined;
  }

  return returnTo;
}
