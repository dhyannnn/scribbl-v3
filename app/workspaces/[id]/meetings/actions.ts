"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { createAppUrl } from "@/lib/app-url";
import { RateLimits } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/current-user";
import { sendMeetingCanceledEmail, sendMeetingScheduledEmail } from "@/lib/email/meeting-notifications";
import { logger } from "@/lib/logger";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canManageMeetingSchedule, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { createWorkspaceNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function scheduleMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAt") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const groupIdRaw = String(formData.get("groupId") ?? "").trim();

  if (!workspaceId || !title || !startsAtValue) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/meetings?meeting=invalid` : "/");
  }

  const startsAt = new Date(startsAtValue);

  if (Number.isNaN(startsAt.getTime())) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=invalid`);
  }

  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
  const endsAt = new Date(startsAt.getTime() + safeDuration * 60 * 1000);

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        name: true,
        plan: true,
        members: {
          where: {
            status: "ACTIVE",
          },
          select: {
            userId: true,
            user: {
              select: {
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        groups: {
          select: {
            id: true,
            members: { select: { userId: true } },
          },
        },
      },
    }),
  ]);

  if (!currentUser || !workspace) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=invalid`);
  }

  if (!workspace.members.some((member) => member.userId === currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=unauthorized`);
  }

  if (!RateLimits.meetingSchedule(currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=rate-limited`);
  }

  // Validate groupId belongs to this workspace and the workspace is on Pro
  const matchedGroup = groupIdRaw && workspace.plan !== "FREE"
    ? workspace.groups.find((g) => g.id === groupIdRaw) ?? null
    : null;
  const groupId = matchedGroup?.id ?? null;

  // Email only goes to group members when scoped; otherwise all workspace members
  const groupMemberUserIds = matchedGroup
    ? new Set(matchedGroup.members.map((m) => m.userId))
    : null;
  const emailRecipientMembers = groupMemberUserIds
    ? workspace.members.filter((m) => groupMemberUserIds.has(m.userId))
    : workspace.members;

  const participantUserIds = Array.from(
    new Set([currentUser.id, ...workspace.members.map((member) => member.userId)]),
  );
  const duplicateWindowStart = new Date(Date.now() - 2 * 60 * 1000);
  const recentDuplicate = await prisma.meeting.findFirst({
    where: {
      workspaceId: workspace.id,
      createdByUserId: currentUser.id,
      title,
      startsAt,
      endsAt,
      canceledAt: null,
      createdAt: {
        gte: duplicateWindowStart,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (recentDuplicate) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=scheduled`);
  }

  let meetingId = "";

  await prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        workspaceId: workspace.id,
        groupId,
        title,
        description: description || null,
        startsAt,
        endsAt,
        provider: "livekit",
        createdByUserId: currentUser.id,
        participants: {
          create: participantUserIds.map((userId) => ({
            userId,
            status: userId === currentUser.id ? "ACCEPTED" : "INVITED",
          })),
        },
      },
      select: {
        id: true,
      },
    });
    meetingId = meeting.id;
    const roomName = createLiveKitMeetingRoomName(meeting.id);

    await tx.meeting.update({
      where: {
        id: meeting.id,
      },
      data: {
        providerMeetingId: roomName,
        meetingUrl: `/workspaces/${workspace.id}/meetings/${meeting.id}/video`,
      },
    });

    await tx.channel.create({
      data: {
        workspaceId: workspace.id,
        meetingId: meeting.id,
        name: formatMeetingChannelName(title),
        type: "CHAT",
        createdByUserId: currentUser.id,
      },
    });
  });

  await writeAuditLog({
    action: "MEETING_SCHEDULED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: meetingId,
    metadata: { title, startsAt: startsAt.toISOString() },
  });

  runAfterResponse(() =>
    createWorkspaceNotifications({
      actorUserId: currentUser.id,
      body: startsAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      groupId,
      href: `/workspaces/${workspaceId}/meetings/${meetingId}`,
      preference: "meetings",
      title: `${title} was scheduled`,
      type: "MEETING_SCHEDULED",
      workspaceId,
    }).then(() => undefined).catch((error) => {
      logger.error("Meeting scheduled notifications could not be created", { meetingId, workspaceId }, error);
    }),
  );

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  revalidatePath(`/workspaces/${workspaceId}/chat`);
  revalidatePath("/");

  runAfterResponse(() =>
    sendScheduledMeetingEmail({
      creatorEmail: currentUser.email,
      durationMinutes: safeDuration,
      meetingId,
      recipients: emailRecipientMembers.map((member) => member.user.email),
      scheduledByName: currentUser.displayName,
      startsAt,
      title,
      workspaceId,
      workspaceName: workspace.name,
      description,
    }).then((emailStatus) => {
      if (emailStatus !== "scheduled") {
        logger.warn("Meeting scheduled email did not send", { emailStatus, meetingId, workspaceId });
      }
    }).catch((error) => {
      logger.resendError({ meetingId, workspaceId, action: "meeting.scheduled" }, error);
    }),
  );

  redirect(`/workspaces/${workspaceId}/meetings?meeting=scheduled`);
}

export async function updateMeetingDetails(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAt") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);

  if (!workspaceId || !meetingId || !title || !startsAtValue) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/meetings?meeting=invalid` : "/");
  }

  const startsAt = new Date(startsAtValue);

  if (Number.isNaN(startsAt.getTime())) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=invalid`);
  }

  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60;
  const endsAt = new Date(startsAt.getTime() + safeDuration * 60 * 1000);
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/meetings/${meetingId}`)}`);
  }

  const [meeting, membership] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        groupId: true,
        createdByUserId: true,
        startsAt: true,
        endsAt: true,
        canceledAt: true,
        workspace: {
          select: {
            name: true,
          },
        },
        participants: {
          select: {
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    }),
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
  ]);

  if (!meeting || meeting.canceledAt || membership?.status !== "ACTIVE") {
    redirect(
      `/workspaces/${workspaceId}/meetings/${meetingId}?meeting=${meeting?.canceledAt ? "read-only" : "unauthorized"}`,
    );
  }

  if (!canManageMeeting(meeting.createdByUserId, currentUser.id, membership.role)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=unauthorized`);
  }

  if (!canManageMeetingSchedule(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  await prisma.$transaction([
    prisma.meeting.update({
      where: {
        id: meeting.id,
      },
      data: {
        title,
        description: description || null,
        startsAt,
        endsAt,
      },
    }),
    prisma.channel.updateMany({
      where: {
        meetingId: meeting.id,
      },
      data: {
        name: formatMeetingChannelName(title),
      },
    }),
  ]);

  runAfterResponse(() =>
    createWorkspaceNotifications({
      actorUserId: currentUser.id,
      body: startsAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      groupId: meeting.groupId,
      href: `/workspaces/${workspaceId}/meetings/${meeting.id}`,
      preference: "meetings",
      title: `${title} was updated`,
      type: "MEETING_UPDATED",
      workspaceId,
    }).then(() => undefined).catch((error) => {
      logger.error("Meeting updated notifications could not be created", { meetingId: meeting.id, workspaceId }, error);
    }),
  );

  revalidatePath(`/workspaces/${workspaceId}/chat`);
  revalidateMeetingPaths(workspaceId, meeting.id);
  redirect(`/workspaces/${workspaceId}/meetings/${meeting.id}?meeting=updated`);
}

export async function cancelMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const cancellationReason = String(formData.get("cancellationReason") ?? "").trim();

  if (!workspaceId || !meetingId) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/meetings?meeting=invalid` : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/meetings/${meetingId}`)}`);
  }

  const [meeting, membership] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
        title: true,
        groupId: true,
        createdByUserId: true,
        startsAt: true,
        endsAt: true,
        canceledAt: true,
        workspace: {
          select: {
            name: true,
          },
        },
        group: {
          select: {
            members: { select: { userId: true } },
          },
        },
        participants: {
          select: {
            userId: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
    }),
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
  ]);

  if (!meeting || meeting.canceledAt || membership?.status !== "ACTIVE") {
    redirect(
      `/workspaces/${workspaceId}/meetings/${meetingId}?meeting=${meeting?.canceledAt ? "read-only" : "unauthorized"}`,
    );
  }

  if (!canManageMeeting(meeting.createdByUserId, currentUser.id, membership.role)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=unauthorized`);
  }

  if (!canManageMeetingSchedule(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  await prisma.meeting.update({
    where: {
      id: meeting.id,
    },
    data: {
      canceledAt: new Date(),
      canceledByUserId: currentUser.id,
      cancellationReason: cancellationReason || null,
    },
  });

  await writeAuditLog({
    action: "MEETING_CANCELED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: meeting.id,
    metadata: { title: meeting.title, cancellationReason: cancellationReason || null },
  });

  runAfterResponse(() =>
    createWorkspaceNotifications({
      actorUserId: currentUser.id,
      body: cancellationReason || null,
      groupId: meeting.groupId,
      href: `/workspaces/${workspaceId}/meetings/${meeting.id}`,
      preference: "meetings",
      title: `${meeting.title} was canceled`,
      type: "MEETING_CANCELED",
      workspaceId,
    }).then(() => undefined).catch((error) => {
      logger.error("Meeting canceled notifications could not be created", { meetingId: meeting.id, workspaceId }, error);
    }),
  );

  revalidateMeetingPaths(workspaceId, meeting.id);

  runAfterResponse(() =>
    sendCanceledMeetingEmail({
      canceledByEmail: currentUser.email,
      canceledByName: currentUser.displayName,
      cancellationReason,
      durationMinutes: getDurationMinutes(meeting.startsAt, meeting.endsAt),
      meetingId: meeting.id,
      recipients: getCancelEmailRecipients(meeting),
      startsAt: meeting.startsAt,
      title: meeting.title,
      workspaceId,
      workspaceName: meeting.workspace?.name ?? "Workspace",
    }).then((emailStatus) => {
      if (emailStatus !== "canceled") {
        logger.warn("Meeting canceled email did not send", { emailStatus, meetingId: meeting.id, workspaceId });
      }
    }).catch((error) => {
      logger.resendError({ meetingId: meeting.id, workspaceId, action: "meeting.canceled" }, error);
    }),
  );

  redirect(`/workspaces/${workspaceId}/meetings?meeting=canceled`);
}

function canManageMeeting(createdByUserId: string, currentUserId: string, role: string) {
  return createdByUserId === currentUserId || role === "OWNER" || role === "ADMIN";
}

function formatMeetingChannelName(title: string) {
  return `Meeting: ${title}`;
}

function revalidateMeetingPaths(workspaceId: string, meetingId: string) {
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  revalidatePath(`/workspaces/${workspaceId}/meetings/${meetingId}`);
  revalidatePath(`/workspaces/${workspaceId}/chat`);
  revalidatePath("/");
}

async function sendScheduledMeetingEmail({
  creatorEmail,
  description,
  durationMinutes,
  meetingId,
  recipients,
  scheduledByName,
  startsAt,
  title,
  workspaceId,
  workspaceName,
}: {
  creatorEmail: string;
  description: string;
  durationMinutes: number;
  meetingId: string;
  recipients: string[];
  scheduledByName: string;
  startsAt: Date;
  title: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const result = await sendMeetingScheduledEmail({
    description: description || null,
    durationMinutes,
    meetingUrl: await createAppUrl(`/workspaces/${workspaceId}/meetings/${meetingId}`),
    recipients: uniqueEmails(recipients).filter((email) => email !== creatorEmail),
    scheduledByName,
    startsAt,
    title,
    workspaceName,
  });

  return getMeetingEmailStatus(result, "scheduled");
}

async function sendCanceledMeetingEmail({
  canceledByEmail,
  canceledByName,
  cancellationReason,
  durationMinutes,
  meetingId,
  recipients,
  startsAt,
  title,
  workspaceId,
  workspaceName,
}: {
  canceledByEmail: string;
  canceledByName: string;
  cancellationReason: string;
  durationMinutes: number;
  meetingId: string;
  recipients: string[];
  startsAt: Date;
  title: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const result = await sendMeetingCanceledEmail({
    canceledByName,
    cancellationReason: cancellationReason || null,
    durationMinutes,
    meetingUrl: await createAppUrl(`/workspaces/${workspaceId}/meetings/${meetingId}`),
    recipients: uniqueEmails(recipients).filter((email) => email !== canceledByEmail),
    startsAt,
    title,
    workspaceName,
  });

  return getMeetingEmailStatus(result, "canceled");
}

function getMeetingEmailStatus(
  result: Awaited<ReturnType<typeof sendMeetingScheduledEmail>>,
  successStatus: "scheduled" | "canceled",
) {
  if (result.ok) {
    return successStatus;
  }

  return result.reason === "not-configured" ? `${successStatus}-email-not-configured` : `${successStatus}-email-failed`;
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.toLowerCase()).filter(Boolean)));
}

function getCancelEmailRecipients(meeting: {
  groupId: string | null;
  group: { members: { userId: string }[] } | null;
  participants: { userId: string; user: { email: string } }[];
}): string[] {
  if (!meeting.groupId || !meeting.group) {
    return meeting.participants.map((p) => p.user.email);
  }
  const groupMemberIds = new Set(meeting.group.members.map((m) => m.userId));
  return meeting.participants
    .filter((p) => groupMemberIds.has(p.userId))
    .map((p) => p.user.email);
}

function getDurationMinutes(startsAt: Date, endsAt?: Date | null) {
  if (!endsAt) {
    return 60;
  }

  return Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
}

function runAfterResponse(task: () => Promise<void>) {
  try {
    after(() => {
      void task();
    });
  } catch {
    void task();
  }
}
