"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAppUrl } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/current-user";
import { sendMeetingCanceledEmail, sendMeetingScheduledEmail } from "@/lib/email/meeting-notifications";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canManageMeetingSchedule, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

export async function scheduleMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAt") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);

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
      },
    }),
  ]);

  if (!currentUser || !workspace) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=invalid`);
  }

  if (!workspace.members.some((member) => member.userId === currentUser.id)) {
    redirect(`/workspaces/${workspaceId}/meetings?meeting=unauthorized`);
  }

  const participantUserIds = Array.from(
    new Set([currentUser.id, ...workspace.members.map((member) => member.userId)]),
  );

  let meetingId = "";

  await prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        workspaceId: workspace.id,
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

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  revalidatePath(`/workspaces/${workspaceId}/chat`);
  revalidatePath("/");

  const emailStatus = await sendScheduledMeetingEmail({
    creatorEmail: currentUser.email,
    durationMinutes: safeDuration,
    meetingId,
    recipients: workspace.members.map((member) => member.user.email),
    scheduledByName: currentUser.displayName,
    startsAt,
    title,
    workspaceId,
    workspaceName: workspace.name,
    description,
  });

  redirect(`/workspaces/${workspaceId}/meetings?meeting=${emailStatus}`);
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

  revalidateMeetingPaths(workspaceId, meeting.id);

  const emailStatus = await sendCanceledMeetingEmail({
    canceledByEmail: currentUser.email,
    canceledByName: currentUser.displayName,
    cancellationReason,
    durationMinutes: getDurationMinutes(meeting.startsAt, meeting.endsAt),
    meetingId: meeting.id,
    recipients: meeting.participants.map((participant) => participant.user.email),
    startsAt: meeting.startsAt,
    title: meeting.title,
    workspaceId,
    workspaceName: meeting.workspace?.name ?? "Workspace",
  });

  redirect(`/workspaces/${workspaceId}/meetings?meeting=${emailStatus}`);
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

function getDurationMinutes(startsAt: Date, endsAt?: Date | null) {
  if (!endsAt) {
    return 60;
  }

  return Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
}
