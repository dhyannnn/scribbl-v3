"use server";

import type { Prisma } from "@prisma/client";
import type { EgressInfo } from "livekit-server-sdk";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import {
  canChangeMeetingRsvp,
  canEditMeetingNotes,
  canJoinMeeting,
  canMutateMeetingArtifacts,
  getMeetingLifecycle,
} from "@/lib/meeting-lifecycle";
import { endMeetingVideoSession, startMeetingVideoSession } from "@/lib/meeting-video-session";
import {
  createMeetingRecordingStorageKey,
  getRecordingStatus,
  getRoomRecording,
  startRoomRecording,
  stopRoomRecording,
} from "@/lib/meeting-recording";
import { createLiveKitMeetingRoomName } from "@/lib/livekit-room";
import { enforceLiveKitVideoPermissions } from "@/lib/livekit-admin";
import {
  canEditMeetingSharedNote,
  canEditMeetingWhiteboard,
  canManageMeetingParticipantPermissions,
  canModerateMeeting,
  getMeetingVideoPermissions,
  type MeetingPermissionState,
  type MeetingPermissionTargetType,
  type MeetingPermissionOverrideInput,
} from "@/lib/meeting-permissions";
import { createDefaultNoteTitle, sanitizeNoteTitle } from "@/lib/note-title";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";

const participantStatuses = ["ACCEPTED", "DECLINED"] as const;
const meetingNoteScopes = ["SHARED", "PRIVATE"] as const;
const meetingNoteTypes = ["TEXT", "WHITEBOARD"] as const;
const noteArtifactTypes = {
  TEXT: "NOTE",
  WHITEBOARD: "WHITEBOARD",
} as const;
const activeRecordingStatuses = ["STARTING", "ACTIVE", "STOPPING"] as const;
const meetingPermissionTargets = ["SHARED_NOTES", "WHITEBOARD", "MICROPHONE", "CAMERA", "SCREEN_SHARE"] as const;
const meetingPermissionStates = ["ALLOWED", "DENIED", "REQUESTED"] as const;

export async function updateCurrentUserParticipantStatus(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const statusValue = String(formData.get("status") ?? "");

  if (
    !workspaceId ||
    !meetingId ||
    !participantStatuses.includes(statusValue as (typeof participantStatuses)[number])
  ) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [participant, membership] = await Promise.all([
    prisma.meetingParticipant.findFirst({
      where: {
        meetingId,
        userId: currentUser.id,
        meeting: {
          workspaceId,
          canceledAt: null,
        },
      },
      select: {
        id: true,
        meeting: {
          select: {
            startsAt: true,
            endsAt: true,
            canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (!participant || membership?.status !== "ACTIVE") {
    return;
  }

  const meetingState = getMeetingLifecycle(participant.meeting);

  if (!canChangeMeetingRsvp(meetingState)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  const status = statusValue as (typeof participantStatuses)[number];

  await prisma.meetingParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      status,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function joinCurrentUserMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [participant, membership] = await Promise.all([
    prisma.meetingParticipant.findFirst({
      where: {
        meetingId,
        userId: currentUser.id,
        meeting: {
          workspaceId,
        },
      },
      select: {
        id: true,
        joinedAt: true,
        meeting: {
          select: {
            startsAt: true,
            endsAt: true,
            canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (!participant || membership?.status !== "ACTIVE") {
    return;
  }

  const meetingState = getMeetingLifecycle(participant.meeting);

  if (!canJoinMeeting(meetingState)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=not-joinable`);
  }

  await prisma.meetingParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      status: "ACCEPTED",
      joinedAt: participant.joinedAt ?? new Date(),
      leftAt: null,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=joined`);
}

export async function leaveCurrentUserMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [participant, membership] = await Promise.all([
    prisma.meetingParticipant.findFirst({
      where: {
        meetingId,
        userId: currentUser.id,
        meeting: {
          workspaceId,
        },
      },
      select: {
        id: true,
        joinedAt: true,
        meeting: {
          select: {
            startsAt: true,
            endsAt: true,
            canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (!participant || membership?.status !== "ACTIVE") {
    return;
  }

  const meetingState = getMeetingLifecycle(participant.meeting);

  if (!canJoinMeeting(meetingState)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=not-joinable`);
  }

  if (!participant.joinedAt) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}`);
  }

  await prisma.meetingParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      leftAt: new Date(),
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=left`);
}

export async function markCurrentUserVideoJoined(
  workspaceId: string,
  meetingId: string,
  clientSessionId: string,
) {
  await updateCurrentUserAttendance(workspaceId, meetingId, clientSessionId, "joined");
}

export async function markCurrentUserVideoLeft(
  workspaceId: string,
  meetingId: string,
  clientSessionId: string,
) {
  await updateCurrentUserAttendance(workspaceId, meetingId, clientSessionId, "left");
}

export async function startMeetingRecording(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(getRecordingRedirectPath(formData, workspaceId, meetingId))}`);
  }

  const [meeting, membership, activeRecording] = await Promise.all([
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
        videoSessions: {
          where: {
            disconnectedAt: null,
          },
          select: {
            id: true,
          },
          take: 1,
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
    prisma.meetingRecording.findFirst({
      where: {
        meetingId,
        status: {
          in: [...activeRecordingStatuses],
        },
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!meeting || membership?.status !== "ACTIVE") {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  if (!canManageMeetingRecording(meeting.createdByUserId, currentUser.id, membership.role)) {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  // Plan check before rate limit — no point consuming a slot for a blocked action
  const workspacePlan = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (workspacePlan?.plan === "FREE") {
    return finishRecordingAction(formData, workspaceId, meetingId, "plan-limit");
  }

  // Recording hour hard-block: reject at 3× the included hours to prevent runaway costs.
  // Use workspacePlan.plan (authoritative) not subscription.plan (may lag behind billing sync).
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: { currentPeriodStart: true, currentPeriodEnd: true },
  });
  if (subscription) {
    const periodStart =
      subscription.currentPeriodStart ??
      new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const { getWorkspaceRecordingSecondsThisPeriod, getIncludedRecordingHours } = await import("@/lib/billing");
    const usedSeconds = await getWorkspaceRecordingSecondsThisPeriod(workspaceId, periodStart);
    // Use workspace plan (already confirmed non-FREE above) so a stale subscription.plan
    // can never incorrectly block a legitimately-paid workspace.
    const includedHours = getIncludedRecordingHours(workspacePlan!.plan);
    if (usedSeconds / 3600 >= includedHours * 3) {
      return finishRecordingAction(formData, workspaceId, meetingId, "plan-limit");
    }
  }

  if (!RateLimits.recordingStart(currentUser.id)) {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  if (!canJoinMeeting(getMeetingLifecycle(meeting))) {
    return finishRecordingAction(formData, workspaceId, meetingId, "not-open");
  }

  if (meeting.videoSessions.length === 0) {
    return finishRecordingAction(formData, workspaceId, meetingId, "no-video-participants");
  }

  if (activeRecording) {
    return finishRecordingAction(formData, workspaceId, meetingId, "already-active");
  }

  const storageKey = createMeetingRecordingStorageKey({
    meetingId,
    workspaceId,
  });
  const recording = await startRoomRecording({
    roomName: createLiveKitMeetingRoomName(meeting.id),
    storageKey,
  });

  if (!recording.info) {
    return finishRecordingAction(formData, workspaceId, meetingId, "start-failed");
  }

  try {
    await prisma.meetingRecording.create({
      data: {
        meetingId,
        egressId: recording.info.egressId,
        status: getRecordingStatus(recording.info),
        storageBucket: recording.storageBucket,
        storageKey,
        startedByUserId: currentUser.id,
        errorMessage: recording.info.error || null,
      },
    });
  } catch {
    await stopRoomRecording(recording.info.egressId);
    return finishRecordingAction(formData, workspaceId, meetingId, "start-failed");
  }

  void writeAuditLog({
    action: "RECORDING_STARTED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: meetingId,
  });

  return finishRecordingAction(formData, workspaceId, meetingId, "started");
}

export async function stopMeetingRecording(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const recordingId = String(formData.get("recordingId") ?? "");

  if (!workspaceId || !meetingId || !recordingId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(getRecordingRedirectPath(formData, workspaceId, meetingId))}`);
  }

  const [recording, membership] = await Promise.all([
    prisma.meetingRecording.findFirst({
      where: {
        id: recordingId,
        meetingId,
        meeting: {
          workspaceId,
        },
      },
      select: {
        id: true,
        egressId: true,
        status: true,
        storageBucket: true,
        storageKey: true,
        fileId: true,
        startedByUserId: true,
        startedAt: true,
        stoppedAt: true,
        meeting: {
          select: {
            id: true,
            title: true,
            createdByUserId: true,
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

  if (!recording || membership?.status !== "ACTIVE") {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  if (!canManageMeetingRecording(recording.meeting.createdByUserId, currentUser.id, membership.role)) {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  if (!RateLimits.recordingStop(currentUser.id)) {
    return finishRecordingAction(formData, workspaceId, meetingId, "unauthorized");
  }

  if (recording.status === "COMPLETED") {
    return finishRecordingAction(formData, workspaceId, meetingId, "already-complete");
  }

  const stoppedRecording = await stopRoomRecording(recording.egressId);

  if (!stoppedRecording.info) {
    await prisma.meetingRecording.update({
      where: {
        id: recording.id,
      },
      data: {
        status: "FAILED",
        stoppedByUserId: currentUser.id,
        stoppedAt: new Date(),
        errorMessage: stoppedRecording.error,
      },
    });
    void writeAuditLog({
      action: "RECORDING_FAILED",
      actorUserId: currentUser.id,
      workspaceId,
      targetId: meetingId,
      metadata: { error: stoppedRecording.error, phase: "stop" },
    });
    return finishRecordingAction(formData, workspaceId, meetingId, "stop-failed");
  }

  await persistRecordingEgressResult({
    recording,
    workspaceId,
    info: stoppedRecording.info,
    stoppedByUserId: currentUser.id,
  });

  void writeAuditLog({
    action: "RECORDING_STOPPED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: meetingId,
  });

  return finishRecordingAction(formData, workspaceId, meetingId, "stopped");
}

export async function refreshMeetingRecordingStatus(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const recordingId = String(formData.get("recordingId") ?? "");

  if (!workspaceId || !meetingId || !recordingId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/meetings/${meetingId}`)}`);
  }

  const [recording, membership] = await Promise.all([
    prisma.meetingRecording.findFirst({
      where: {
        id: recordingId,
        meetingId,
        meeting: {
          workspaceId,
        },
      },
      select: {
        id: true,
        egressId: true,
        status: true,
        storageBucket: true,
        storageKey: true,
        fileId: true,
        startedByUserId: true,
        startedAt: true,
        stoppedAt: true,
        meeting: {
          select: {
            id: true,
            title: true,
            createdByUserId: true,
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

  if (!recording || membership?.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?recording=unauthorized`);
  }

  if (!canManageMeetingRecording(recording.meeting.createdByUserId, currentUser.id, membership.role)) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?recording=unauthorized`);
  }

  const latestRecording = await getRoomRecording(recording.egressId);

  if (!latestRecording.info) {
    await prisma.meetingRecording.update({
      where: {
        id: recording.id,
      },
      data: {
        errorMessage: latestRecording.error,
      },
    });
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?recording=refresh-failed`);
  }

  await persistRecordingEgressResult({
    recording,
    workspaceId,
    info: latestRecording.info,
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?recording=refreshed`);
}

export async function syncMeetingRecordingStatus({
  meetingId,
  recordingId,
  workspaceId,
}: {
  meetingId: string;
  recordingId: string;
  workspaceId: string;
}) {
  if (!workspaceId || !meetingId || !recordingId) {
    return { ok: false };
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return { ok: false };
  }

  const [recording, membership] = await Promise.all([
    prisma.meetingRecording.findFirst({
      where: {
        id: recordingId,
        meetingId,
        meeting: {
          workspaceId,
        },
      },
      select: {
        id: true,
        egressId: true,
        status: true,
        storageBucket: true,
        storageKey: true,
        fileId: true,
        startedByUserId: true,
        startedAt: true,
        stoppedAt: true,
        meeting: {
          select: {
            id: true,
            title: true,
            createdByUserId: true,
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

  if (!recording || membership?.status !== "ACTIVE") {
    return { ok: false };
  }

  if (!canManageMeetingRecording(recording.meeting.createdByUserId, currentUser.id, membership.role)) {
    return { ok: false };
  }

  if (recording.status === "COMPLETED" || recording.status === "FAILED") {
    return { ok: true, status: recording.status };
  }

  const latestRecording = await getRoomRecording(recording.egressId);

  if (!latestRecording.info) {
    await prisma.meetingRecording.update({
      where: {
        id: recording.id,
      },
      data: {
        errorMessage: latestRecording.error,
      },
    });
    return { ok: false };
  }

  const status = getRecordingStatus(latestRecording.info);

  await persistRecordingEgressResult({
    recording,
    workspaceId,
    info: latestRecording.info,
  });

  revalidateMeetingPaths(workspaceId, meetingId);

  return { ok: true, status };
}

export async function attachNoteToMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");

  if (!workspaceId || !meetingId || !noteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [meeting, note, membership] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        canceledAt: true,
      },
    }),
    prisma.note.findFirst({
      where: {
        id: noteId,
        workspaceId,
        deletedAt: null,
        visibility: "WORKSPACE_SHARED",
      },
      select: {
        id: true,
        type: true,
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
        status: true,
      },
    }),
  ]);

  if (!meeting || !note || membership?.status !== "ACTIVE") {
    return;
  }

  if (!canMutateMeetingArtifacts(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  const existingArtifact = await prisma.meetingArtifact.findFirst({
    where: {
      meetingId,
      noteId: note.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingArtifact) {
    await prisma.meetingArtifact.create({
      data: {
        meetingId,
        noteId: note.id,
        type: noteArtifactTypes[note.type],
        source: "ATTACHED",
        createdByUserId: currentUser.id,
      },
    });
  }

  revalidateMeetingPaths(workspaceId, meetingId);
  redirect(
    `/workspaces/${workspaceId}/meetings/${meetingId}?sharedNoteId=${note.id}#meeting-notes`,
  );
}

export async function attachFileToMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  if (!workspaceId || !meetingId || !fileId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [meeting, file, membership] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        canceledAt: true,
      },
    }),
    prisma.file.findFirst({
      where: {
        id: fileId,
        workspaceId,
        visibility: "WORKSPACE_SHARED",
      },
      select: {
        id: true,
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
        status: true,
      },
    }),
  ]);

  if (!meeting || !file || membership?.status !== "ACTIVE") {
    return;
  }

  if (!canMutateMeetingArtifacts(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  const existingArtifact = await prisma.meetingArtifact.findFirst({
    where: {
      meetingId,
      fileId: file.id,
    },
    select: {
      id: true,
    },
  });

  if (!existingArtifact) {
    await prisma.meetingArtifact.create({
      data: {
        meetingId,
        fileId: file.id,
        type: "FILE",
        source: "ATTACHED",
        createdByUserId: currentUser.id,
      },
    });
  }

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function createMeetingSharedNote(formData: FormData) {
  await createMeetingNote(formData);
}

export async function requestMeetingPermission(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const targetTypeValue = String(formData.get("targetType") ?? "");
  const artifactId = getOptionalFormString(formData.get("artifactId"));

  if (!workspaceId || !meetingId || !isMeetingPermissionTarget(targetTypeValue)) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [meeting, membership, artifact] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
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
        status: true,
      },
    }),
    artifactId
      ? prisma.meetingArtifact.findFirst({
          where: {
            id: artifactId,
            meetingId,
          },
          select: {
            id: true,
          },
        })
      : null,
  ]);

  if (!meeting || membership?.status !== "ACTIVE" || (artifactId && !artifact)) {
    return;
  }

  await upsertMeetingPermissionOverride({
    meetingId,
    userId: currentUser.id,
    targetType: targetTypeValue,
    artifactId,
    state: "REQUESTED",
    grantedByUserId: null,
  });

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function setMeetingPermissionOverride(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const targetTypeValue = String(formData.get("targetType") ?? "");
  const stateValue = String(formData.get("state") ?? "");
  const artifactId = getOptionalFormString(formData.get("artifactId"));

  if (
    !workspaceId ||
    !meetingId ||
    !userId ||
    !isMeetingPermissionTarget(targetTypeValue) ||
    !isMeetingPermissionState(stateValue)
  ) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [meeting, currentMembership, targetParticipant, targetMembership, artifact] = await Promise.all([
    prisma.meeting.findFirst({
      where: {
        id: meetingId,
        workspaceId,
      },
      select: {
        id: true,
        createdByUserId: true,
        moderationSettings: true,
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
    prisma.meetingParticipant.findFirst({
      where: {
        meetingId,
        userId,
      },
      select: {
        id: true,
      },
    }),
    prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    }),
    artifactId
      ? prisma.meetingArtifact.findFirst({
          where: {
            id: artifactId,
            meetingId,
          },
          select: {
            id: true,
          },
        })
      : null,
  ]);

  if (
    !meeting ||
    currentMembership?.status !== "ACTIVE" ||
    !targetParticipant ||
    targetMembership?.status !== "ACTIVE" ||
    (artifactId && !artifact) ||
    !canManageMeetingParticipantPermissions({
      currentUserId: currentUser.id,
      meetingCreatedByUserId: meeting.createdByUserId,
      currentUserRole: currentMembership.role,
      targetUserId: userId,
      targetUserRole: targetMembership.role,
    })
  ) {
    return;
  }

  await upsertMeetingPermissionOverride({
    meetingId,
    userId,
    targetType: targetTypeValue,
    artifactId,
    state: stateValue,
    grantedByUserId: currentUser.id,
  });

  if (isVideoPermissionTarget(targetTypeValue)) {
    await enforceParticipantVideoPermission({
      meetingId,
      meetingCreatedByUserId: meeting.createdByUserId,
      settings: meeting.moderationSettings,
      targetUserId: userId,
      targetUserRole: targetMembership.role,
    });
  }

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function createMeetingNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const scopeValue = String(formData.get("scope") ?? "SHARED");
  const typeValue = String(formData.get("type") ?? "TEXT");
  const noteFocusValue = String(formData.get("noteFocus") ?? "");

  if (
    !workspaceId ||
    !meetingId ||
    !meetingNoteScopes.includes(scopeValue as (typeof meetingNoteScopes)[number]) ||
    !meetingNoteTypes.includes(typeValue as (typeof meetingNoteTypes)[number])
  ) {
    return;
  }

  const scope = scopeValue as (typeof meetingNoteScopes)[number];
  const type = typeValue as (typeof meetingNoteTypes)[number];
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
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
        moderationSettings: true,
        permissionOverrides: {
          where: {
            userId: currentUser.id,
          },
          select: {
            userId: true,
            targetType: true,
            artifactId: true,
            state: true,
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

  if (!meeting || membership?.status !== "ACTIVE") {
    return;
  }

  // Shared whiteboards are Pro+ only — private whiteboards are allowed on Free
  if (type === "WHITEBOARD" && scope === "SHARED") {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true },
    });
    if (workspace?.plan === "FREE") {
      redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=whiteboard-upgrade-required`);
    }
  }

  if (!canEditMeetingNotes(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
  }

  if (
    scope === "SHARED" &&
    !(type === "WHITEBOARD" ? canEditMeetingWhiteboard : canEditMeetingSharedNote)({
      currentUserId: currentUser.id,
      meetingCreatedByUserId: meeting.createdByUserId,
      currentUserRole: membership.role,
      settings: meeting.moderationSettings,
      overrides: meeting.permissionOverrides,
    })
  ) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=permission-denied`);
  }

  const note = await prisma.note.create({
    data: {
      workspaceId,
      ownerUserId: currentUser.id,
      title: createDefaultNoteTitle({
        scope: scope === "SHARED" ? "WORKSPACE_SHARED" : "PRIVATE",
        type,
        collaborative: scope === "SHARED",
      }),
      type,
      visibility: scope === "SHARED" ? "WORKSPACE_SHARED" : "PRIVATE",
      collaboration: scope === "SHARED" ? "COLLABORATIVE" : "SOLO",
      sourceDevice: "WEB",
      storageType: "JSON",
      contentJson:
        type === "TEXT"
          ? { type: "tiptap", content: { type: "doc", content: [] }, html: "" }
          : { strokes: [] },
    },
    select: {
      id: true,
    },
  });

  await prisma.meetingArtifact.create({
    data: {
      meetingId,
      noteId: note.id,
      type: noteArtifactTypes[type],
      source: "CREATED_IN_MEETING",
      createdByUserId: currentUser.id,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  const focusQuery =
    noteFocusValue === "shared" || noteFocusValue === "private" ? `&noteFocus=${noteFocusValue}` : "";
  redirect(
    `/workspaces/${workspaceId}/meetings/${meetingId}?${
      scope === "SHARED" ? "sharedNoteId" : "privateNoteId"
    }=${note.id}${focusQuery}#meeting-notes`,
  );
}

export async function saveMeetingSharedNote(formData: FormData) {
  await saveMeetingNote(formData);
}

export async function saveMeetingNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const title = sanitizeNoteTitle(formData.get("title"), "Shared meeting notes");
  const contentJsonRaw = String(formData.get("contentJson") ?? "");

  if (!workspaceId || !meetingId || !noteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [artifact, membership] = await Promise.all([
    prisma.meetingArtifact.findFirst({
      where: {
        meetingId,
        noteId,
        type: "NOTE",
        meeting: {
          workspaceId,
        },
        note: {
          workspaceId,
          type: "TEXT",
          deletedAt: null,
          OR: [
            {
              visibility: "WORKSPACE_SHARED",
            },
            {
              visibility: "PRIVATE",
              ownerUserId: currentUser.id,
            },
          ],
        },
      },
      select: {
        id: true,
        noteId: true,
        source: true,
        meeting: {
          select: {
            createdByUserId: true,
            startsAt: true,
            endsAt: true,
            canceledAt: true,
            moderationSettings: true,
            permissionOverrides: {
              where: {
                userId: currentUser.id,
              },
              select: {
                userId: true,
                targetType: true,
                artifactId: true,
                state: true,
              },
            },
          },
        },
        note: {
          select: {
            ownerUserId: true,
            collaboration: true,
            visibility: true,
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

  if (
    !artifact?.noteId ||
    !artifact.note ||
    membership?.status !== "ACTIVE" ||
    isLockedMeetingNoteArtifact(artifact) ||
    !canEditMeetingTextNoteArtifact({
      artifactId: artifact.id,
      currentUserId: currentUser.id,
      currentUserRole: membership.role,
      meetingCreatedByUserId: artifact.meeting.createdByUserId,
      note: artifact.note,
      overrides: artifact.meeting.permissionOverrides,
      settings: artifact.meeting.moderationSettings,
    })
  ) {
    return;
  }

  let parsedContent: Prisma.InputJsonValue = { type: "tiptap", content: { type: "doc", content: [] }, html: "" };
  if (contentJsonRaw) {
    try {
      const parsed = JSON.parse(contentJsonRaw) as unknown;
      if (parsed && typeof parsed === "object") {
        parsedContent = parsed as Prisma.InputJsonValue;
      }
    } catch {
      // keep default empty doc
    }
  }

  await prisma.note.update({
    where: {
      id: artifact.noteId,
    },
    data: {
      title,
      contentJson: parsedContent,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  revalidatePath(`/workspaces/${workspaceId}/notes/${artifact.noteId}`);
}

export async function saveMeetingWhiteboard(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const title = sanitizeNoteTitle(formData.get("title"), "Untitled whiteboard");
  const snapshotJson = String(formData.get("snapshotJson") ?? "");

  if (!workspaceId || !meetingId || !noteId || !snapshotJson) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [artifact, membership] = await Promise.all([
    prisma.meetingArtifact.findFirst({
      where: {
        meetingId,
        noteId,
        type: "WHITEBOARD",
        meeting: {
          workspaceId,
        },
        note: {
          workspaceId,
          type: "WHITEBOARD",
          deletedAt: null,
          OR: [
            {
              visibility: "WORKSPACE_SHARED",
            },
            {
              visibility: "PRIVATE",
              ownerUserId: currentUser.id,
            },
          ],
        },
      },
      select: {
        id: true,
        noteId: true,
        source: true,
        meeting: {
          select: {
            createdByUserId: true,
            startsAt: true,
            endsAt: true,
            canceledAt: true,
            moderationSettings: true,
            permissionOverrides: {
              where: {
                userId: currentUser.id,
              },
              select: {
                userId: true,
                targetType: true,
                artifactId: true,
                state: true,
              },
            },
          },
        },
        note: {
          select: {
            ownerUserId: true,
            collaboration: true,
            visibility: true,
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

  if (
    !artifact?.noteId ||
    !artifact.note ||
    membership?.status !== "ACTIVE" ||
    isLockedMeetingNoteArtifact(artifact) ||
    !canEditMeetingWhiteboardArtifact({
      artifactId: artifact.id,
      currentUserId: currentUser.id,
      currentUserRole: membership.role,
      meetingCreatedByUserId: artifact.meeting.createdByUserId,
      note: artifact.note,
      overrides: artifact.meeting.permissionOverrides,
      settings: artifact.meeting.moderationSettings,
    })
  ) {
    return;
  }

  // Shared whiteboards are Pro+ only — block saves of shared boards on Free
  // Private meeting whiteboards are allowed on all plans
  const workspaceForPlan = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (workspaceForPlan?.plan === "FREE" && artifact.note?.visibility === "WORKSPACE_SHARED") return;

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    return;
  }

  await prisma.note.update({
    where: {
      id: artifact.noteId,
    },
    data: {
      title,
      contentJson: { type: "tldraw", snapshot } as Prisma.InputJsonValue,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  revalidatePath(`/workspaces/${workspaceId}/notes/${artifact.noteId}`);
}

export async function raiseHand(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const [participant, membership, meeting] = await Promise.all([
    prisma.meetingParticipant.findFirst({
      where: { meetingId, userId: currentUser.id, meeting: { workspaceId } },
      select: { id: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.meeting.findFirst({
      where: { id: meetingId, workspaceId },
      select: { createdByUserId: true, moderationSettings: { select: { handRaiseEnabled: true } } },
    }),
  ]);

  if (!participant || membership?.status !== "ACTIVE" || !meeting) return;

  const isModerator = canModerateMeeting({
    currentUserId: currentUser.id,
    meetingCreatedByUserId: meeting.createdByUserId,
    currentUserRole: membership.role,
  });
  const handRaiseEnabled = meeting.moderationSettings?.handRaiseEnabled ?? true;

  if (!isModerator && !handRaiseEnabled) return;
  if (!RateLimits.handRaise(currentUser.id)) return;

  await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: { handRaisedAt: new Date(), handLoweredAt: null },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function admitToMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!workspaceId || !meetingId || !userId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, workspaceId },
    select: {
      createdByUserId: true,
      workspace: { select: { members: { where: { userId: currentUser.id, status: "ACTIVE" }, select: { role: true }, take: 1 } } },
    },
  });
  if (!meeting) return;

  const role = meeting.workspace?.members[0]?.role;
  if (!role) return;

  if (!canModerateMeeting({ currentUserId: currentUser.id, meetingCreatedByUserId: meeting.createdByUserId, currentUserRole: role })) return;

  await prisma.$transaction([
    prisma.meetingAdmission.upsert({
      where: { meetingId_userId: { meetingId, userId } },
      create: { meetingId, userId },
      update: { admittedAt: new Date() },
    }),
    prisma.meetingWaitingUser.deleteMany({ where: { meetingId, userId } }),
  ]);
}

export async function admitAllToMeeting(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, workspaceId },
    select: {
      createdByUserId: true,
      workspace: { select: { members: { where: { userId: currentUser.id, status: "ACTIVE" }, select: { role: true }, take: 1 } } },
      waitingUsers: { select: { userId: true } },
    },
  });
  if (!meeting) return;

  const role = meeting.workspace?.members[0]?.role;
  if (!role) return;

  if (!canModerateMeeting({ currentUserId: currentUser.id, meetingCreatedByUserId: meeting.createdByUserId, currentUserRole: role })) return;

  const userIds = meeting.waitingUsers.map((w) => w.userId);
  if (userIds.length === 0) return;

  await prisma.$transaction([
    prisma.meetingAdmission.createMany({
      data: userIds.map((userId) => ({ meetingId, userId })),
      skipDuplicates: true,
    }),
    prisma.meetingWaitingUser.deleteMany({ where: { meetingId } }),
  ]);
}

export async function lowerOwnHand(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");

  if (!workspaceId || !meetingId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const participant = await prisma.meetingParticipant.findFirst({
    where: { meetingId, userId: currentUser.id, meeting: { workspaceId } },
    select: { id: true },
  });

  if (!participant) return;

  await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: { handLoweredAt: new Date() },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
}

export async function lowerParticipantHand(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  if (!workspaceId || !meetingId || !userId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const [meeting, currentMembership, targetParticipant, targetMembership] = await Promise.all([
    prisma.meeting.findFirst({
      where: { id: meetingId, workspaceId },
      select: { createdByUserId: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.meetingParticipant.findFirst({
      where: { meetingId, userId },
      select: { id: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true, status: true },
    }),
  ]);

  if (
    !meeting ||
    currentMembership?.status !== "ACTIVE" ||
    !targetParticipant ||
    targetMembership?.status !== "ACTIVE" ||
    !canManageMeetingParticipantPermissions({
      currentUserId: currentUser.id,
      meetingCreatedByUserId: meeting.createdByUserId,
      currentUserRole: currentMembership.role,
      targetUserId: userId,
      targetUserRole: targetMembership.role,
    })
  ) {
    return;
  }

  await prisma.meetingParticipant.update({
    where: { id: targetParticipant.id },
    data: { handLoweredAt: new Date() },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
}

function revalidateMeetingPaths(workspaceId: string, meetingId: string) {
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  revalidatePath(`/workspaces/${workspaceId}/meetings/${meetingId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings/${meetingId}/video`);
  revalidatePath(`/workspaces/${workspaceId}/files`);
  revalidatePath("/");
}

function getRecordingRedirectPath(formData: FormData, workspaceId: string, meetingId: string, status?: string) {
  const destination = formData.get("recordingReturnTo") === "video" ? "video" : "hub";
  const basePath =
    destination === "video"
      ? `/workspaces/${workspaceId}/meetings/${meetingId}/video`
      : `/workspaces/${workspaceId}/meetings/${meetingId}`;

  return status ? `${basePath}?recording=${status}` : basePath;
}

function finishRecordingAction(formData: FormData, workspaceId: string, meetingId: string, status: string) {
  revalidateMeetingPaths(workspaceId, meetingId);

  if (formData.get("recordingReturnTo") === "current") {
    return {
      ok: !["unauthorized", "not-open", "no-video-participants", "start-failed", "stop-failed"].includes(status),
      status,
    };
  }

  redirect(getRecordingRedirectPath(formData, workspaceId, meetingId, status));
}

type PersistableRecording = {
  id: string;
  egressId: string;
  storageBucket: string;
  storageKey: string;
  fileId: string | null;
  startedByUserId: string;
  startedAt: Date;
  stoppedAt: Date | null;
  meeting: {
    id: string;
    title: string;
  };
};

async function persistRecordingEgressResult({
  info,
  recording,
  stoppedByUserId,
  workspaceId,
}: {
  info: EgressInfo;
  recording: PersistableRecording;
  stoppedByUserId?: string;
  workspaceId: string;
}) {
  const status = getRecordingStatus(info);
  const fileResult = info.fileResults[0];
  const completedAt = status === "COMPLETED" ? new Date() : undefined;
  const shouldCreateArtifact = status === "COMPLETED" && !recording.fileId;

  await prisma.$transaction(async (tx) => {
    let fileId = recording.fileId;

    if (shouldCreateArtifact) {
      const file = await tx.file.create({
        data: {
          workspaceId,
          uploadedByUserId: recording.startedByUserId,
          name: createRecordingFileName(recording.meeting.title),
          mimeType: "video/mp4",
          sizeBytes: fileResult ? getSafeFileSize(fileResult.size) : null,
          visibility: "WORKSPACE_SHARED",
          storageBucket: recording.storageBucket,
          storageKey: recording.storageKey,
          publicUrl: null,
        },
        select: {
          id: true,
        },
      });
      fileId = file.id;

      await tx.meetingArtifact.create({
        data: {
          meetingId: recording.meeting.id,
          type: "RECORDING",
          source: "CREATED_IN_MEETING",
          fileId,
          createdByUserId: recording.startedByUserId,
        },
      });
    }

    // Use the existing stoppedAt if the user already clicked stop; fall back to
    // now only if this is the first time we're learning the recording ended.
    const endTime = recording.stoppedAt ?? new Date();
    const durationSeconds =
      status === "COMPLETED" && recording.startedAt
        ? Math.round((endTime.getTime() - recording.startedAt.getTime()) / 1000)
        : undefined;

    await tx.meetingRecording.update({
      where: {
        id: recording.id,
      },
      data: {
        status,
        fileId,
        stoppedByUserId,
        stoppedAt: stoppedByUserId ? new Date() : undefined,
        completedAt,
        durationSeconds,
        errorMessage: info.error || null,
      },
    });
  });

  if (status === "COMPLETED") {
    void writeAuditLog({
      action: "RECORDING_COMPLETED",
      actorUserId: recording.startedByUserId,
      workspaceId,
      targetId: recording.meeting.id,
    });
  } else if (status === "FAILED") {
    void writeAuditLog({
      action: "RECORDING_FAILED",
      actorUserId: recording.startedByUserId,
      workspaceId,
      targetId: recording.meeting.id,
      metadata: { error: info.error, phase: "egress" },
    });
  }
}

function canManageMeetingRecording(createdByUserId: string, currentUserId: string, role: string) {
  return createdByUserId === currentUserId || role === "OWNER" || role === "ADMIN";
}

function createRecordingFileName(meetingTitle: string) {
  const safeTitle = meetingTitle
    .trim()
    .replaceAll(/[/\\]/g, "-")
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return `${safeTitle || "Meeting"} recording ${new Date().toISOString().slice(0, 10)}.mp4`;
}

function getSafeFileSize(size: bigint) {
  const fileSize = Number(size);

  return Number.isSafeInteger(fileSize) ? fileSize : null;
}

async function updateCurrentUserAttendance(
  workspaceId: string,
  meetingId: string,
  clientSessionId: string,
  attendance: "joined" | "left",
) {
  if (!workspaceId || !meetingId || !clientSessionId) {
    return {
      ok: false,
    };
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return {
      ok: false,
    };
  }

  const result =
    attendance === "joined"
      ? await startMeetingVideoSession({
          workspaceId,
          meetingId,
          userId: currentUser.id,
          clientSessionId,
        })
      : await endMeetingVideoSession({
          workspaceId,
          meetingId,
          userId: currentUser.id,
          clientSessionId,
        });

  if (!result.ok) {
    return result;
  }

  if (attendance === "joined") {
    const prevStatus = currentUser.status !== "IN_MEETING"
      ? currentUser.status
      : (currentUser.previousStatus ?? "ONLINE");
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { status: "IN_MEETING", previousStatus: prevStatus },
    });
  } else {
    const restoreStatus = currentUser.previousStatus ?? "ONLINE";
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { status: restoreStatus, previousStatus: null },
    });
  }

  revalidateMeetingPaths(workspaceId, meetingId);

  return {
    ok: true,
  };
}

function canEditNote(
  note: {
    ownerUserId: string;
    collaboration: string;
    visibility?: string;
  },
  currentUserId: string,
) {
  return note.ownerUserId === currentUserId || note.collaboration === "COLLABORATIVE";
}

function canEditMeetingTextNoteArtifact({
  artifactId,
  currentUserId,
  currentUserRole,
  meetingCreatedByUserId,
  note,
  overrides,
  settings,
}: {
  artifactId: string;
  currentUserId: string;
  currentUserRole: string;
  meetingCreatedByUserId: string;
  note: {
    ownerUserId: string;
    collaboration: string;
    visibility: string;
  };
  overrides: {
    userId: string;
    targetType: MeetingPermissionTargetType;
    artifactId: string | null;
    state: MeetingPermissionState;
  }[];
  settings: Parameters<typeof canEditMeetingSharedNote>[0]["settings"];
}) {
  if (note.visibility === "PRIVATE") {
    return canEditNote(note, currentUserId);
  }

  return canEditMeetingSharedNote({
    artifactId,
    currentUserId,
    currentUserRole,
    meetingCreatedByUserId,
    overrides,
    settings,
  });
}

function canEditMeetingWhiteboardArtifact({
  artifactId,
  currentUserId,
  currentUserRole,
  meetingCreatedByUserId,
  note,
  overrides,
  settings,
}: {
  artifactId: string;
  currentUserId: string;
  currentUserRole: string;
  meetingCreatedByUserId: string;
  note: {
    ownerUserId: string;
    collaboration: string;
    visibility: string;
  };
  overrides: {
    userId: string;
    targetType: MeetingPermissionTargetType;
    artifactId: string | null;
    state: MeetingPermissionState;
  }[];
  settings: Parameters<typeof canEditMeetingWhiteboard>[0]["settings"];
}) {
  if (note.visibility === "PRIVATE") {
    return canEditNote(note, currentUserId);
  }

  return canEditMeetingWhiteboard({
    artifactId,
    currentUserId,
    currentUserRole,
    meetingCreatedByUserId,
    overrides,
    settings,
  });
}

function getOptionalFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMeetingPermissionTarget(value: string): value is MeetingPermissionTargetType {
  return meetingPermissionTargets.includes(value as (typeof meetingPermissionTargets)[number]);
}

function isMeetingPermissionState(value: string): value is MeetingPermissionState {
  return meetingPermissionStates.includes(value as (typeof meetingPermissionStates)[number]);
}

function isVideoPermissionTarget(value: MeetingPermissionTargetType) {
  return value === "MICROPHONE" || value === "CAMERA" || value === "SCREEN_SHARE";
}

async function enforceParticipantVideoPermission({
  meetingCreatedByUserId,
  meetingId,
  settings,
  targetUserId,
  targetUserRole,
}: {
  meetingId: string;
  meetingCreatedByUserId: string;
  settings: Parameters<typeof getMeetingVideoPermissions>[0]["settings"];
  targetUserId: string;
  targetUserRole: string;
}) {
  const overrides = await prisma.meetingPermissionOverride.findMany({
    where: {
      meetingId,
      userId: targetUserId,
    },
    select: {
      userId: true,
      targetType: true,
      artifactId: true,
      state: true,
    },
  });
  const permissions = getMeetingVideoPermissions({
    currentUserId: targetUserId,
    meetingCreatedByUserId,
    currentUserRole: targetUserRole,
    settings,
    overrides: overrides as MeetingPermissionOverrideInput[],
  });

  await enforceLiveKitVideoPermissions({
    identity: targetUserId,
    permissions,
    roomName: createLiveKitMeetingRoomName(meetingId),
  });
}

async function upsertMeetingPermissionOverride({
  artifactId,
  grantedByUserId,
  meetingId,
  state,
  targetType,
  userId,
}: {
  meetingId: string;
  userId: string;
  targetType: MeetingPermissionTargetType;
  artifactId: string | null;
  state: MeetingPermissionState;
  grantedByUserId: string | null;
}) {
  const existingOverride = await prisma.meetingPermissionOverride.findFirst({
    where: {
      meetingId,
      userId,
      targetType,
      artifactId,
    },
    select: {
      id: true,
    },
  });

  if (existingOverride) {
    await prisma.meetingPermissionOverride.update({
      where: {
        id: existingOverride.id,
      },
      data: {
        state,
        grantedByUserId,
      },
    });
    return;
  }

  await prisma.meetingPermissionOverride.create({
    data: {
      meetingId,
      userId,
      targetType,
      artifactId,
      state,
      grantedByUserId,
    },
  });
}

function isLockedMeetingNoteArtifact(artifact: {
  source: string;
  meeting: {
    startsAt: Date;
    endsAt: Date | null;
    canceledAt: Date | null;
  };
  note: {
    visibility: string;
  } | null;
}) {
  return (
    artifact.source === "CREATED_IN_MEETING" &&
    artifact.note?.visibility === "WORKSPACE_SHARED" &&
    !canEditMeetingNotes(getMeetingLifecycle(artifact.meeting))
  );
}
