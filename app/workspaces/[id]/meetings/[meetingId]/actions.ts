"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import {
  canChangeMeetingRsvp,
  canEditMeetingNotes,
  canJoinMeeting,
  canMutateMeetingArtifacts,
  getMeetingLifecycle,
} from "@/lib/meeting-lifecycle";
import { endMeetingVideoSession, startMeetingVideoSession } from "@/lib/meeting-video-session";
import { createDefaultNoteTitle, sanitizeNoteTitle } from "@/lib/note-title";
import { prisma } from "@/lib/prisma";

const participantStatuses = ["ACCEPTED", "DECLINED"] as const;
const meetingNoteScopes = ["SHARED", "PRIVATE"] as const;
const meetingNoteTypes = ["TEXT", "WHITEBOARD"] as const;
const noteArtifactTypes = {
  TEXT: "NOTE",
  WHITEBOARD: "WHITEBOARD",
} as const;

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

export async function createMeetingNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const scopeValue = String(formData.get("scope") ?? "SHARED");
  const typeValue = String(formData.get("type") ?? "TEXT");

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
        startsAt: true,
        endsAt: true,
        canceledAt: true,
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

  if (!meeting || membership?.status !== "ACTIVE") {
    return;
  }

  if (!canEditMeetingNotes(getMeetingLifecycle(meeting))) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}?meeting=read-only`);
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
      contentJson: type === "TEXT" ? { text: "" } : { strokes: [] },
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
  redirect(
    `/workspaces/${workspaceId}/meetings/${meetingId}?${
      scope === "SHARED" ? "sharedNoteId" : "privateNoteId"
    }=${note.id}#meeting-notes`,
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
  const text = String(formData.get("text") ?? "");

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
        noteId: true,
        source: true,
        meeting: {
          select: {
            startsAt: true,
            endsAt: true,
            canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (
    !artifact?.noteId ||
    !artifact.note ||
    membership?.status !== "ACTIVE" ||
    isLockedMeetingNoteArtifact(artifact) ||
    !canEditNote(artifact.note, currentUser.id)
  ) {
    return;
  }

  await prisma.note.update({
    where: {
      id: artifact.noteId,
    },
    data: {
      title,
      contentJson: {
        text,
      },
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
  const strokesJson = String(formData.get("strokesJson") ?? "");
  const pagesJson = String(formData.get("pagesJson") ?? "");
  const activePageId = String(formData.get("activePageId") ?? "");

  if (!workspaceId || !meetingId || !noteId || !strokesJson) {
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
        noteId: true,
        source: true,
        meeting: {
          select: {
            startsAt: true,
            endsAt: true,
            canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (
    !artifact?.noteId ||
    !artifact.note ||
    membership?.status !== "ACTIVE" ||
    isLockedMeetingNoteArtifact(artifact) ||
    !canEditNote(artifact.note, currentUser.id)
  ) {
    return;
  }

  const whiteboardContent = parseWhiteboardContent({
    activePageId,
    pagesJson,
    strokesJson,
  });

  if (!whiteboardContent) {
    return;
  }

  await prisma.note.update({
    where: {
      id: artifact.noteId,
    },
    data: {
      title,
      contentJson: whiteboardContent as Prisma.InputJsonValue,
    },
  });

  revalidateMeetingPaths(workspaceId, meetingId);
  revalidatePath(`/workspaces/${workspaceId}/notes/${artifact.noteId}`);
}

function revalidateMeetingPaths(workspaceId: string, meetingId: string) {
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  revalidatePath(`/workspaces/${workspaceId}/meetings/${meetingId}`);
  revalidatePath("/");
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

  revalidateMeetingPaths(workspaceId, meetingId);

  return {
    ok: true,
  };
}

function parseWhiteboardContent({
  activePageId,
  pagesJson,
  strokesJson,
}: {
  activePageId: string;
  pagesJson: string;
  strokesJson: string;
}) {
  let strokes: unknown;

  try {
    strokes = JSON.parse(strokesJson);
  } catch {
    return null;
  }

  if (!Array.isArray(strokes)) {
    return null;
  }

  let pages: unknown;

  if (pagesJson) {
    try {
      pages = JSON.parse(pagesJson);
    } catch {
      pages = null;
    }
  }

  if (Array.isArray(pages)) {
    const whiteboardPages = pages.filter(isWhiteboardPage);

    if (whiteboardPages.length > 0) {
      const safeActivePageId = whiteboardPages.some((page) => page.id === activePageId)
        ? activePageId
        : whiteboardPages[0].id;
      const activePage = whiteboardPages.find((page) => page.id === safeActivePageId) ?? whiteboardPages[0];

      return {
        pages: whiteboardPages,
        activePageId: safeActivePageId,
        strokes: activePage.strokes,
      };
    }
  }

  return {
    strokes,
  };
}

function isWhiteboardPage(value: unknown): value is {
  id: string;
  title: string;
  strokes: unknown[];
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybePage = value as { id?: unknown; title?: unknown; strokes?: unknown };

  return (
    typeof maybePage.id === "string" &&
    typeof maybePage.title === "string" &&
    Array.isArray(maybePage.strokes) &&
    maybePage.strokes.every(isStroke)
  );
}

function isStroke(value: unknown) {
  if (!value || typeof value !== "object" || !("points" in value)) {
    return false;
  }

  const maybeStroke = value as { points?: unknown };

  return (
    Array.isArray(maybeStroke.points) &&
    maybeStroke.points.every(
      (point) =>
        point &&
        typeof point === "object" &&
        typeof (point as { x?: unknown }).x === "number" &&
        typeof (point as { y?: unknown }).y === "number",
    )
  );
}

function canEditNote(
  note: {
    ownerUserId: string;
    collaboration: string;
  },
  currentUserId: string,
) {
  return note.ownerUserId === currentUserId || note.collaboration === "COLLABORATIVE";
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
