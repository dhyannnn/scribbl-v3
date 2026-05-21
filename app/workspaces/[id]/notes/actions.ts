"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { createDefaultNoteTitle, sanitizeNoteTitle } from "@/lib/note-title";
import { prisma } from "@/lib/prisma";

const noteVisibilities = ["PRIVATE", "WORKSPACE_SHARED"] as const;
const noteCollaborations = ["SOLO", "COLLABORATIVE"] as const;
const noteExportAccesses = ["OWNER_ADMIN_AND_CREATOR", "WORKSPACE_MEMBERS"] as const;

export async function createTextNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "WORKSPACE_SHARED");
  const collaborationValue = String(formData.get("collaboration") ?? "SOLO");

  if (
    !workspaceId ||
    !noteVisibilities.includes(visibilityValue as (typeof noteVisibilities)[number]) ||
    !noteCollaborations.includes(collaborationValue as (typeof noteCollaborations)[number])
  ) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const visibility = visibilityValue as (typeof noteVisibilities)[number];
  const collaboration =
    visibility === "PRIVATE" ? "SOLO" : (collaborationValue as (typeof noteCollaborations)[number]);

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
      },
    }),
  ]);

  if (!currentUser || !workspace) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: currentUser.id,
      },
    },
    select: {
      status: true,
    },
  });

  if (membership?.status !== "ACTIVE") {
    redirect(`/workspaces/${workspace.id}/notes?note=unauthorized`);
  }

  const note = await prisma.note.create({
    data: {
      workspaceId: workspace.id,
      ownerUserId: currentUser.id,
      title: createDefaultNoteTitle({
        scope: visibility,
        type: "TEXT",
        collaborative: collaboration === "COLLABORATIVE",
      }),
      type: "TEXT",
      visibility,
      collaboration,
      sourceDevice: "WEB",
      storageType: "JSON",
      contentJson: {
        type: "tiptap",
        content: { type: "doc", content: [] },
        html: "",
      },
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/notes/${note.id}`);
}

export async function createWhiteboardNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "WORKSPACE_SHARED");
  const collaborationValue = String(formData.get("collaboration") ?? "SOLO");

  if (
    !workspaceId ||
    !noteVisibilities.includes(visibilityValue as (typeof noteVisibilities)[number]) ||
    !noteCollaborations.includes(collaborationValue as (typeof noteCollaborations)[number])
  ) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const visibility = visibilityValue as (typeof noteVisibilities)[number];
  const collaboration =
    visibility === "PRIVATE" ? "SOLO" : (collaborationValue as (typeof noteCollaborations)[number]);

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        plan: true,
      },
    }),
  ]);

  // Shared whiteboards are Pro+ only; private whiteboards are available on all plans
  if (workspace?.plan === "FREE" && visibility === "WORKSPACE_SHARED") {
    redirect(`/workspaces/${workspaceId}/notes?note=shared-whiteboard-upgrade-required`);
  }

  if (!currentUser || !workspace) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: currentUser.id,
      },
    },
    select: {
      status: true,
    },
  });

  if (membership?.status !== "ACTIVE") {
    redirect(`/workspaces/${workspace.id}/notes?note=unauthorized`);
  }

  const note = await prisma.note.create({
    data: {
      workspaceId: workspace.id,
      ownerUserId: currentUser.id,
      title: createDefaultNoteTitle({
        scope: visibility,
        type: "WHITEBOARD",
        collaborative: collaboration === "COLLABORATIVE",
      }),
      type: "WHITEBOARD",
      visibility,
      collaboration,
      sourceDevice: "WEB",
      storageType: "JSON",
      contentJson: {
        strokes: [],
      },
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/notes/${note.id}`);
}

export async function saveTextNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const title = sanitizeNoteTitle(formData.get("title"), "Untitled note");
  const contentJsonRaw = String(formData.get("contentJson") ?? "");

  if (!workspaceId || !noteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: {
        id: noteId,
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
      select: {
        id: true,
        visibility: true,
        ownerUserId: true,
        collaboration: true,
        artifacts: {
          select: {
            id: true,
            source: true,
            meeting: {
              select: {
                startsAt: true,
                endsAt: true,
                canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (
    !note ||
    membership?.status !== "ACTIVE" ||
    hasLockedMeetingArtifact(note) ||
    !canEditNote(note, currentUser.id)
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
      id: note.id,
    },
    data: {
      title,
      contentJson: parsedContent,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  revalidatePath("/");
}

export async function saveWhiteboardNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const title = sanitizeNoteTitle(formData.get("title"), "Untitled whiteboard");
  const snapshotJson = String(formData.get("snapshotJson") ?? "");

  if (!workspaceId || !noteId || !snapshotJson) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  // Shared whiteboards are Pro+ only — block saves of shared boards on Free
  // Private whiteboards are allowed on all plans
  const workspaceForPlan = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: {
        id: noteId,
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
      select: {
        id: true,
        visibility: true,
        ownerUserId: true,
        collaboration: true,
        artifacts: {
          select: {
            id: true,
            source: true,
            meeting: {
              select: {
                startsAt: true,
                endsAt: true,
                canceledAt: true,
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
        status: true,
      },
    }),
  ]);

  if (
    !note ||
    membership?.status !== "ACTIVE" ||
    hasLockedMeetingArtifact(note) ||
    !canEditNote(note, currentUser.id)
  ) {
    return;
  }

  // Block saving shared whiteboards on Free — private whiteboards are allowed
  if (workspaceForPlan?.plan === "FREE" && note.visibility === "WORKSPACE_SHARED") {
    return;
  }

  let snapshot: unknown;
  try {
    snapshot = JSON.parse(snapshotJson);
  } catch {
    return;
  }

  await prisma.note.update({
    where: {
      id: note.id,
    },
    data: {
      title,
      contentJson: { type: "tldraw", snapshot } as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  revalidatePath("/");
}

export async function deleteWorkspaceNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");

  if (!workspaceId || !noteId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return;
  }

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: {
        id: noteId,
        workspaceId,
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
      select: {
        id: true,
        ownerUserId: true,
        visibility: true,
        artifacts: {
          select: {
            meetingId: true,
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

  if (!note || membership?.status !== "ACTIVE") {
    return;
  }

  const canManageWorkspaceNotes = membership.role === "OWNER" || membership.role === "ADMIN";
  const canDelete =
    note.visibility === "WORKSPACE_SHARED"
      ? note.ownerUserId === currentUser.id || canManageWorkspaceNotes
      : note.ownerUserId === currentUser.id;

  if (!canDelete) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.meetingArtifact.deleteMany({
      where: {
        noteId: note.id,
      },
    });

    await tx.note.update({
      where: {
        id: note.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  });

  void writeAuditLog({
    action: "NOTE_DELETED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: note.id,
    metadata: { visibility: note.visibility },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  for (const artifact of note.artifacts) {
    revalidatePath(`/workspaces/${workspaceId}/meetings/${artifact.meetingId}`);
  }
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/notes?note=deleted`);
}

export async function updateNoteExportAccess(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const exportAccessValue = String(formData.get("exportAccess") ?? "");

  if (
    !workspaceId ||
    !noteId ||
    !noteExportAccesses.includes(exportAccessValue as (typeof noteExportAccesses)[number])
  ) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid-export` : "/");
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/notes`)}`);
  }

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: {
        id: noteId,
        workspaceId,
        deletedAt: null,
        visibility: "WORKSPACE_SHARED",
      },
      select: {
        id: true,
        ownerUserId: true,
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

  const canManageWorkspaceNotes = membership?.role === "OWNER" || membership?.role === "ADMIN";

  if (!note || membership?.status !== "ACTIVE" || (note.ownerUserId !== currentUser.id && !canManageWorkspaceNotes)) {
    redirect(`/workspaces/${workspaceId}/notes?note=export-unauthorized`);
  }

  await prisma.note.update({
    where: {
      id: note.id,
    },
    data: {
      exportAccess: exportAccessValue as (typeof noteExportAccesses)[number],
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/notes?note=export-updated`);
}

export async function updateNoteVisibility(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "");

  if (!workspaceId || !noteId || !noteVisibilities.includes(visibilityValue as (typeof noteVisibilities)[number])) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/notes`)}`);
  }

  const [note, membership] = await Promise.all([
    prisma.note.findFirst({
      where: { id: noteId, workspaceId, deletedAt: null },
      select: { id: true, ownerUserId: true, visibility: true, type: true, workspace: { select: { plan: true } } },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
  ]);

  if (!note || membership?.status !== "ACTIVE") {
    redirect(`/workspaces/${workspaceId}/notes?note=not-found`);
  }

  const isNoteOwner = note.ownerUserId === currentUser.id;
  const isWorkspaceOwnerOrAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";

  // Shared notes: owner, workspace owner/admin can change visibility
  // Private notes: only the note creator/owner can change
  const canChange = note.visibility === "WORKSPACE_SHARED"
    ? (isNoteOwner || isWorkspaceOwnerOrAdmin)
    : isNoteOwner;

  if (!canChange) {
    redirect(`/workspaces/${workspaceId}/notes/${noteId}?note=unauthorized`);
  }

  const newVisibility = visibilityValue as (typeof noteVisibilities)[number];

  // Free plan: whiteboards cannot be made shared
  if (note.workspace?.plan === "FREE" && note.type === "WHITEBOARD" && newVisibility === "WORKSPACE_SHARED") {
    redirect(`/workspaces/${workspaceId}/notes/${noteId}?note=plan-upgrade-required`);
  }

  await prisma.note.update({
    where: { id: note.id },
    data: { visibility: newVisibility },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/notes`);
  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  revalidatePath("/");
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

function hasLockedMeetingArtifact(note: {
  visibility: string;
  artifacts?: {
    source: string;
    meeting: {
      startsAt: Date;
      endsAt: Date | null;
      canceledAt: Date | null;
    } | null;
  }[];
}) {
  return Boolean(
    note.artifacts?.some(
      (artifact) =>
        artifact.source === "CREATED_IN_MEETING" &&
        note.visibility === "WORKSPACE_SHARED" &&
        artifact.meeting &&
        !canEditMeetingNotes(getMeetingLifecycle(artifact.meeting)),
    ),
  );
}
