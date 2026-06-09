"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { createAppUrl } from "@/lib/app-url";
import { RateLimits } from "@/lib/rate-limit";
import { parseLocalDateTimeInZone } from "@/lib/timezone";
import { getCurrentUser } from "@/lib/current-user";
import { sendMeetingCanceledEmail, sendMeetingScheduledEmail, sendMeetingSeriesScheduledEmail } from "@/lib/email/meeting-notifications";
import { logger } from "@/lib/logger";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { canManageMeetingSchedule, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { createWorkspaceNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function startCall(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const calleeUserId = String(formData.get("calleeUserId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");

  if (!workspaceId || !calleeUserId) {
    redirect(workspaceId ? `/workspaces/${workspaceId}` : "/");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login`);
  }

  const [callerMembership, calleeMembership] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { status: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: calleeUserId } },
      select: {
        status: true,
        user: {
          select: {
            displayName: true,
            notificationPreference: { select: { calls: true } },
          },
        },
      },
    }),
  ]);

  if (callerMembership?.status !== "ACTIVE" || calleeMembership?.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}`);
  }

  // Block if callee is already in an active video session.
  // Exclude sessions whose meeting has ended/been canceled, and sessions older
  // than 4 hours (zombie sessions from clients that didn't cleanly disconnect).
  const sessionCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
  const calleeActiveSession = await prisma.meetingVideoSession.findFirst({
    where: {
      userId: calleeUserId,
      disconnectedAt: null,
      connectedAt: { gte: sessionCutoff },
      meeting: { canceledAt: null, endsAt: null },
    },
    select: { id: true },
  });
  if (calleeActiveSession) {
    const busyRedirect = channelId
      ? `/workspaces/${workspaceId}/chat/${channelId}?call=busy`
      : `/workspaces/${workspaceId}?call=busy`;
    redirect(busyRedirect);
  }

  // Clean up any expired pending calls the caller left behind
  await prisma.pendingCall.deleteMany({
    where: { callerId: currentUser.id, expiresAt: { lt: new Date() } },
  });

  const callsEnabled = calleeMembership.user.notificationPreference?.calls ?? true;

  let meetingId = "";

  await prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        workspaceId,
        title: "Call",
        startsAt: new Date(),
        provider: "livekit",
        createdByUserId: currentUser.id,
        waitingRoom: false,
        type: "ONE_ON_ONE",
        participants: {
          create: [
            { userId: currentUser.id, status: "ACCEPTED" },
            { userId: calleeUserId, status: "ACCEPTED" },
          ],
        },
      },
      select: { id: true },
    });

    meetingId = meeting.id;
    const roomName = createLiveKitMeetingRoomName(meeting.id);
    const videoUrl = `/workspaces/${workspaceId}/meetings/${meeting.id}/video`;

    await tx.meeting.update({
      where: { id: meeting.id },
      data: {
        providerMeetingId: roomName,
        meetingUrl: videoUrl,
      },
    });

    // Only ring the callee if they have calls enabled. When disabled, skip the
    // PendingCall entirely so the realtime listener never fires on their end.
    if (callsEnabled) {
      await tx.pendingCall.create({
        data: {
          meetingId: meeting.id,
          callerId: currentUser.id,
          calleeId: calleeUserId,
          expiresAt: new Date(Date.now() + 30_000),
        },
      });

      await tx.notification.create({
        data: {
          userId: calleeUserId,
          workspaceId,
          actorUserId: currentUser.id,
          type: "CALL_INCOMING",
          title: `${currentUser.displayName} is calling you`,
          href: videoUrl,
        },
      });
    }
  });

  redirect(`/workspaces/${workspaceId}/meetings/${meetingId}/video`);
}

export async function declineCall(pendingCallId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthorized" };

  const pendingCall = await prisma.pendingCall.findUnique({
    where: { id: pendingCallId },
    select: { calleeId: true, callerId: true, meetingId: true, meeting: { select: { workspaceId: true } } },
  });

  if (!pendingCall || pendingCall.calleeId !== currentUser.id) {
    return { error: "not_found" };
  }

  const workspaceId = pendingCall.meeting.workspaceId;
  const now = new Date();

  await prisma.$transaction([
    prisma.pendingCall.deleteMany({ where: { id: pendingCallId } }),
    prisma.meeting.update({
      where: { id: pendingCall.meetingId },
      data: { canceledAt: now, canceledByUserId: currentUser.id, cancellationReason: "Callee declined" },
    }),
    prisma.notification.create({
      data: {
        userId: pendingCall.callerId,
        workspaceId,
        actorUserId: currentUser.id,
        type: "CALL_INCOMING",
        title: `${currentUser.displayName} declined your call`,
        href: `/workspaces/${workspaceId}/calls`,
      },
    }),
  ]);

  return { ok: true };
}

export async function cancelCall(pendingCallId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthorized" };

  const pendingCall = await prisma.pendingCall.findUnique({
    where: { id: pendingCallId },
    select: { callerId: true, calleeId: true, meetingId: true, meeting: { select: { workspaceId: true } } },
  });

  if (!pendingCall || pendingCall.callerId !== currentUser.id) {
    return { error: "not_found" };
  }

  const workspaceId = pendingCall.meeting.workspaceId;
  const now = new Date();

  await prisma.$transaction([
    prisma.pendingCall.deleteMany({ where: { id: pendingCallId } }),
    prisma.meeting.update({
      where: { id: pendingCall.meetingId },
      data: { canceledAt: now, canceledByUserId: currentUser.id, cancellationReason: "Caller canceled" },
    }),
    prisma.notification.create({
      data: {
        userId: pendingCall.calleeId,
        workspaceId,
        actorUserId: currentUser.id,
        type: "CALL_INCOMING",
        title: `Missed call from ${currentUser.displayName}`,
        href: `/workspaces/${workspaceId}/calls`,
      },
    }),
  ]);

  return { ok: true, workspaceId };
}

export async function expireCall(pendingCallId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthorized" };

  const pendingCall = await prisma.pendingCall.findUnique({
    where: { id: pendingCallId },
    select: { callerId: true, calleeId: true, meetingId: true, meeting: { select: { workspaceId: true } } },
  });

  if (!pendingCall || pendingCall.callerId !== currentUser.id) {
    return { error: "not_found" };
  }

  const workspaceId = pendingCall.meeting.workspaceId;
  const now = new Date();

  await prisma.$transaction([
    prisma.pendingCall.deleteMany({ where: { id: pendingCallId } }),
    prisma.meeting.update({
      where: { id: pendingCall.meetingId },
      data: { canceledAt: now, canceledByUserId: currentUser.id, cancellationReason: "No answer" },
    }),
    prisma.notification.create({
      data: {
        userId: pendingCall.calleeId,
        workspaceId,
        actorUserId: currentUser.id,
        type: "CALL_INCOMING",
        title: `Missed call from ${currentUser.displayName}`,
        href: `/workspaces/${workspaceId}/calls`,
      },
    }),
  ]);

  return { ok: true, workspaceId };
}

export async function acceptCall(pendingCallId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthorized" };

  const result = await prisma.$transaction(async (tx) => {
    const call = await tx.pendingCall.findUnique({
      where: { id: pendingCallId },
      select: { calleeId: true, meetingId: true, expiresAt: true, meeting: { select: { workspaceId: true } } },
    });

    if (!call || call.calleeId !== currentUser.id) return { error: "not_found" as const };
    if (call.expiresAt < new Date()) {
      await tx.pendingCall.deleteMany({ where: { id: pendingCallId } });
      return { error: "expired" as const };
    }

    const deleted = await tx.pendingCall.deleteMany({ where: { id: pendingCallId } });
    if (deleted.count === 0) return { error: "already_accepted" as const };

    return { meetingId: call.meetingId, workspaceId: call.meeting.workspaceId };
  });

  return result;
}

export async function scheduleMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAt") ?? "");
  const timezoneOffset = parseInt(String(formData.get("timezoneOffset") ?? "0"), 10);
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const groupIdRaw = String(formData.get("groupId") ?? "").trim();
  const userTimezone = String(formData.get("userTimezone") ?? "UTC");
  const waitingRoom = formData.get("waitingRoom") === "on";

  if (!workspaceId || !title || !startsAtValue) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/meetings?meeting=invalid` : "/");
  }

  const startsAt = parseLocalDateTimeInZone(startsAtValue, userTimezone);

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

  if (!await RateLimits.meetingSchedule(currentUser.id)) {
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

  // Parse optional recurrence
  const VALID_RECURRENCES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
  type RecurrenceFrequency = (typeof VALID_RECURRENCES)[number];
  const recurrenceRaw = String(formData.get("recurrence") ?? "").trim();
  const recurrence = VALID_RECURRENCES.includes(recurrenceRaw as RecurrenceFrequency)
    ? (recurrenceRaw as RecurrenceFrequency)
    : null;
  const recurrenceEndsAtRaw = String(formData.get("recurrenceEndsAt") ?? "").trim();
  const recurrenceEndsAtDate = recurrenceEndsAtRaw
    ? parseLocalDateTimeInZone(recurrenceEndsAtRaw + "T23:59", userTimezone)
    : null;
  const isRecurringSeries =
    recurrence !== null &&
    recurrenceEndsAtDate !== null &&
    !isNaN(recurrenceEndsAtDate.getTime()) &&
    recurrenceEndsAtDate > startsAt;

  let meetingId = "";
  let seriesInfo: { firstSlot: Date; lastSlot: Date; sessionCount: number } | null = null;

  try {
  if (isRecurringSeries) {
    // ── Recurring series ─────────────────────────────────────────────────────
    // Pre-generate all IDs upfront so we can build the full dataset without
    // holding an interactive transaction open across multiple async round-trips
    // (pgBouncer connection-pooling breaks async-callback transactions).
    const seriesId = crypto.randomUUID();
    const durationMs = safeDuration * 60 * 1000;
    const slots = generateSeriesDates(startsAt, durationMs, recurrence!, recurrenceEndsAtDate!);

    if (slots.length === 0) {
      redirect(`/workspaces/${workspaceId}/meetings?meeting=invalid`);
    }

    const meetingIds = slots.map(() => crypto.randomUUID());
    meetingId = meetingIds[0];
    seriesInfo = {
      firstSlot: slots[0].startsAt,
      lastSlot: slots[slots.length - 1].startsAt,
      sessionCount: slots.length,
    };

    // One shared channel for the whole series (no meetingId — it belongs to the series)
    const seriesChannelId = crypto.randomUUID();

    const meetingsData = slots.map((slot, i) => {
      const id = meetingIds[i];
      return {
        id,
        workspaceId: workspace.id,
        groupId,
        title,
        description: description || null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        provider: "livekit",
        providerMeetingId: createLiveKitMeetingRoomName(id),
        meetingUrl: `/workspaces/${workspace.id}/meetings/${id}/video`,
        createdByUserId: currentUser.id,
        seriesId,
        seriesChannelId,
        recurrence: recurrence!,
        seriesIndex: i + 1,
        recurrenceEndsAt: recurrenceEndsAtDate,
        waitingRoom,
      };
    });

    const participantsData = meetingIds.flatMap((id) =>
      participantUserIds.map((userId) => ({
        meetingId: id,
        userId,
        status: (userId === currentUser.id ? "ACCEPTED" : "INVITED") as "ACCEPTED" | "INVITED",
      })),
    );

    await prisma.$transaction([
      prisma.channel.create({
        data: {
          id: seriesChannelId,
          workspaceId: workspace.id,
          name: formatMeetingChannelName(title),
          type: "CHAT",
          createdByUserId: currentUser.id,
        },
      }),
      prisma.meeting.createMany({ data: meetingsData }),
      prisma.meetingParticipant.createMany({ data: participantsData }),
    ]);
  } else {
    // ── Single meeting ───────────────────────────────────────────────────────
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
          waitingRoom,
          participants: {
            create: participantUserIds.map((userId) => ({
              userId,
              status: userId === currentUser.id ? "ACCEPTED" : "INVITED",
            })),
          },
        },
        select: { id: true },
      });
      meetingId = meeting.id;
      const roomName = createLiveKitMeetingRoomName(meeting.id);

      await tx.meeting.update({
        where: { id: meeting.id },
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
  }

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
        timeZone: userTimezone,
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

  const capturedSeriesInfo = seriesInfo;
  if (capturedSeriesInfo) {
    runAfterResponse(() =>
      sendSeriesMeetingEmail({
        creatorEmail: currentUser.email,
        description,
        durationMinutes: safeDuration,
        firstSessionAt: capturedSeriesInfo.firstSlot,
        lastSessionAt: capturedSeriesInfo.lastSlot,
        recurrence: recurrence!,
        recipients: emailRecipientMembers.map((member) => member.user.email),
        scheduledByName: currentUser.displayName,
        sessionCount: capturedSeriesInfo.sessionCount,
        timeZone: userTimezone,
        title,
        workspaceId,
        workspaceName: workspace.name,
      }).then((emailStatus) => {
        if (emailStatus !== "scheduled") {
          logger.warn("Series scheduled email did not send", { emailStatus, meetingId, workspaceId });
        }
      }).catch((error) => {
        logger.resendError({ meetingId, workspaceId, action: "meeting.series-scheduled" }, error);
      }),
    );
  } else {
    runAfterResponse(() =>
      sendScheduledMeetingEmail({
        creatorEmail: currentUser.email,
        durationMinutes: safeDuration,
        meetingId,
        recipients: emailRecipientMembers.map((member) => member.user.email),
        scheduledByName: currentUser.displayName,
        startsAt,
        timeZone: userTimezone,
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
  }

  redirect(`/workspaces/${workspaceId}/meetings?meeting=scheduled`);
  } catch (err) {
    unstable_rethrow(err);
    logger.error("scheduleMeeting failed", { workspaceId, title }, err);
    redirect(`/workspaces/${workspaceId}/meetings?meeting=error`);
  }
}

export async function updateMeetingDetails(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startsAtValue = String(formData.get("startsAt") ?? "");
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const scopeRaw = String(formData.get("editScope") ?? "THIS");
  const editScope = scopeRaw === "THIS_AND_FUTURE" || scopeRaw === "ALL" ? scopeRaw : "THIS";
  const userTimezone = String(formData.get("userTimezone") ?? "UTC");
  const waitingRoom = formData.get("waitingRoom") === "on";

  if (!workspaceId || !meetingId || !title || !startsAtValue) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/meetings?meeting=invalid` : "/");
  }

  const startsAt = parseLocalDateTimeInZone(startsAtValue, userTimezone);

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
        seriesId: true,
        seriesIndex: true,
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

  const timeDelta = startsAt.getTime() - meeting.startsAt.getTime();
  const durationMs = endsAt.getTime() - startsAt.getTime();

  if ((editScope === "THIS_AND_FUTURE" || editScope === "ALL") && meeting.seriesId) {
    const seriesMeetings = await prisma.meeting.findMany({
      where: {
        seriesId: meeting.seriesId,
        ...(editScope === "THIS_AND_FUTURE" && meeting.seriesIndex != null
          ? { seriesIndex: { gte: meeting.seriesIndex } }
          : {}),
        canceledAt: null,
      },
      select: { id: true, startsAt: true },
      orderBy: { seriesIndex: "asc" },
    });

    await prisma.$transaction(
      seriesMeetings.flatMap((sm) => {
        const newStart = new Date(sm.startsAt.getTime() + timeDelta);
        const newEnd = new Date(newStart.getTime() + durationMs);
        return [
          prisma.meeting.update({
            where: { id: sm.id },
            data: { title, description: description || null, startsAt: newStart, endsAt: newEnd, waitingRoom },
          }),
          prisma.channel.updateMany({
            where: { meetingId: sm.id },
            data: { name: formatMeetingChannelName(title) },
          }),
        ];
      }),
    );
  } else {
    await prisma.$transaction([
      prisma.meeting.update({
        where: { id: meeting.id },
        data: { title, description: description || null, startsAt, endsAt, waitingRoom },
      }),
      prisma.channel.updateMany({
        where: { meetingId: meeting.id },
        data: { name: formatMeetingChannelName(title) },
      }),
    ]);
  }

  runAfterResponse(() =>
    createWorkspaceNotifications({
      actorUserId: currentUser.id,
      body: startsAt.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: userTimezone,
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
  const cancelScopeRaw = String(formData.get("cancelScope") ?? "THIS");
  const cancelScope = cancelScopeRaw === "THIS_AND_FUTURE" ? "THIS_AND_FUTURE" : "THIS";

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
        seriesId: true,
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

  const cancelData = {
    canceledAt: new Date(),
    canceledByUserId: currentUser.id,
    cancellationReason: cancellationReason || null,
  };

  if (cancelScope === "THIS_AND_FUTURE" && meeting.seriesId) {
    await prisma.meeting.updateMany({
      where: {
        seriesId: meeting.seriesId,
        startsAt: { gte: meeting.startsAt },
        canceledAt: null,
      },
      data: cancelData,
    });
  } else {
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: cancelData,
    });
  }

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

function generateSeriesDates(
  startsAt: Date,
  durationMs: number,
  frequency: string,
  endsAt: Date,
): Array<{ startsAt: Date; endsAt: Date }> {
  const results: Array<{ startsAt: Date; endsAt: Date }> = [];
  const current = new Date(startsAt);
  while (current <= endsAt && results.length < 365) {
    results.push({ startsAt: new Date(current), endsAt: new Date(current.getTime() + durationMs) });
    switch (frequency) {
      case "DAILY": current.setDate(current.getDate() + 1); break;
      case "WEEKLY": current.setDate(current.getDate() + 7); break;
      case "BIWEEKLY": current.setDate(current.getDate() + 14); break;
      case "MONTHLY": current.setMonth(current.getMonth() + 1); break;
      default: return results; // unknown frequency, stop
    }
  }
  return results;
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
  timeZone,
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
  timeZone: string;
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
    timeZone,
    title,
    workspaceName,
  });

  return getMeetingEmailStatus(result, "scheduled");
}

async function sendSeriesMeetingEmail(args: Parameters<typeof sendMeetingSeriesScheduledEmail>[0]) {
  const result = await sendMeetingSeriesScheduledEmail(args);
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
  const run = () => task().catch((err) => console.error("[runAfterResponse]", err));
  try {
    after(run);
  } catch {
    void run();
  }
}
