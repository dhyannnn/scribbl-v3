"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { canEditMeetingNotes, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { canEditMeetingSharedNote, canEditMeetingWhiteboard } from "@/lib/meeting-permissions";
import { createDefaultNoteTitle, sanitizeNoteTitle } from "@/lib/note-title";
import { prisma } from "@/lib/prisma";

const noteVisibilities = ["PRIVATE", "WORKSPACE_SHARED"] as const;
const noteCollaborations = ["SOLO", "COLLABORATIVE"] as const;
const noteExportAccesses = ["OWNER_ADMIN_AND_CREATOR", "WORKSPACE_MEMBERS"] as const;

export async function createTextNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "WORKSPACE_SHARED");
  const collaborationValue = String(formData.get("collaboration") ?? "SOLO");
  const userTimezone = String(formData.get("userTimezone") || "UTC");

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
        timeZone: userTimezone,
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
  const userTimezone = String(formData.get("userTimezone") || "UTC");

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
        timeZone: userTimezone,
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

export async function createMindboardNote(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "WORKSPACE_SHARED");
  const collaborationValue = String(formData.get("collaboration") ?? "SOLO");
  const userTimezone = String(formData.get("userTimezone") || "UTC");

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
      where: { id: workspaceId },
      select: { id: true, plan: true },
    }),
  ]);

  // Shared mindboards are Pro+ only; private mindboards are available on all plans
  if (workspace?.plan === "FREE" && visibility === "WORKSPACE_SHARED") {
    redirect(`/workspaces/${workspaceId}/notes?note=shared-mindboard-upgrade-required`);
  }

  if (!currentUser || !workspace) {
    redirect(workspaceId ? `/workspaces/${workspaceId}/notes?note=invalid` : "/");
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: currentUser.id } },
    select: { status: true },
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
        type: "MINDBOARD",
        collaborative: collaboration === "COLLABORATIVE",
        timeZone: userTimezone,
      }),
      type: "MINDBOARD",
      visibility,
      collaboration,
      sourceDevice: "WEB",
      storageType: "JSON",
      contentJson: { strokes: [] },
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
                createdByUserId: true,
                moderationSettings: true,
                permissionOverrides: {
                  where: { userId: currentUser.id },
                  select: { userId: true, targetType: true, artifactId: true, state: true },
                },
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

  if (
    !note ||
    membership?.status !== "ACTIVE" ||
    hasLockedMeetingArtifact(note) ||
    hasActiveMeetingPermissionBlock(note, "TEXT", currentUser.id, membership.role) ||
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

  // Fire NOTE_MENTION notifications for any @mentioned users (skip if already notified and unread)
  const mentionedUserIds = extractMentionIds(parsedContent);
  if (mentionedUserIds.length > 0) {
    const href = `/workspaces/${workspaceId}/notes/${noteId}`;
    const eligibleIds = mentionedUserIds.filter((uid) => uid !== currentUser.id);
    if (eligibleIds.length > 0) {
      const already = await prisma.notification.findMany({
        where: { userId: { in: eligibleIds }, actorUserId: currentUser.id, type: "NOTE_MENTION", href, readAt: null },
        select: { userId: true },
      });
      const alreadySet = new Set(already.map((n) => n.userId));
      const newIds = eligibleIds.filter((uid) => !alreadySet.has(uid));
      if (newIds.length > 0) {
        await prisma.notification.createMany({
          data: newIds.map((uid) => ({
            userId: uid,
            workspaceId,
            actorUserId: currentUser.id,
            type: "NOTE_MENTION",
            title: `${currentUser.displayName} mentioned you in "${title}"`,
            href,
          })),
        });
      }
    }
  }

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
        type: { in: ["WHITEBOARD", "MINDBOARD"] },
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
                createdByUserId: true,
                moderationSettings: true,
                permissionOverrides: {
                  where: { userId: currentUser.id },
                  select: { userId: true, targetType: true, artifactId: true, state: true },
                },
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

  if (
    !note ||
    membership?.status !== "ACTIVE" ||
    hasLockedMeetingArtifact(note) ||
    hasActiveMeetingPermissionBlock(note, "WHITEBOARD", currentUser.id, membership.role) ||
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

  // Free plan: whiteboards and mindboards cannot be made shared
  if (note.workspace?.plan === "FREE" && (note.type === "WHITEBOARD" || note.type === "MINDBOARD") && newVisibility === "WORKSPACE_SHARED") {
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

// ── Embed meta ────────────────────────────────────────────────────────────────

export async function fetchEmbedMeta(rawUrl: string): Promise<{ title: string; provider: string; embedUrl: string } | null> {
  const { toEmbedUrl, EMBED_ALLOWED_HOSTS } = await import("@/lib/tiptap/embed-url");

  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }

  if (!EMBED_ALLOWED_HOSTS.includes(url.hostname)) return null;

  const provider = url.hostname.replace(/^www\./, "").split(".")[0] ?? "embed";

  const embedUrl = toEmbedUrl(rawUrl);
  if (!embedUrl) return null;

  let title = "";
  try {
    const res = await fetch(rawUrl, { method: "GET", headers: { "User-Agent": "Scribblbot/1.0" }, signal: AbortSignal.timeout(4000) });
    const html = await res.text();
    const match = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)
      ?? /<title>([^<]+)<\/title>/i.exec(html);
    if (match?.[1]) title = match[1].trim();
  } catch { /* silent */ }

  return { title, provider, embedUrl };
}

// ── Page setup ────────────────────────────────────────────────────────────────

export async function updateNotePageSetup(
  noteId: string,
  data: {
    orientation: string;
    marginTop: number;
    marginBottom: number;
    marginLeft: number;
    marginRight: number;
  },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
    select: { id: true, ownerUserId: true, workspaceId: true },
  });
  if (!note) return;
  if (note.ownerUserId !== currentUser.id) return;

  await prisma.note.update({
    where: { id: note.id },
    data: {
      orientation: data.orientation === "landscape" ? "landscape" : "portrait",
      marginTop: Math.max(0, Math.min(200, data.marginTop)),
      marginBottom: Math.max(0, Math.min(200, data.marginBottom)),
      marginLeft: Math.max(0, Math.min(200, data.marginLeft)),
      marginRight: Math.max(0, Math.min(200, data.marginRight)),
    },
  });

  if (note.workspaceId) {
    revalidatePath(`/workspaces/${note.workspaceId}/notes/${noteId}`);
  }
}

// ── Public share ──────────────────────────────────────────────────────────────

export async function toggleNoteShare(
  noteId: string,
  workspaceId: string,
): Promise<{ isPublic: boolean; shareToken: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { isPublic: false, shareToken: null };

  const note = await prisma.note.findFirst({
    where: { id: noteId, workspaceId, deletedAt: null },
    select: { id: true, ownerUserId: true, isPublic: true, shareToken: true },
  });
  if (!note || note.ownerUserId !== currentUser.id) return { isPublic: false, shareToken: null };

  const newIsPublic = !note.isPublic;
  const newToken = newIsPublic ? (note.shareToken ?? crypto.randomUUID()) : note.shareToken;

  await prisma.note.update({
    where: { id: note.id },
    data: { isPublic: newIsPublic, shareToken: newToken },
  });

  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  return { isPublic: newIsPublic, shareToken: newIsPublic ? (newToken ?? null) : null };
}

// ── Inline comments ───────────────────────────────────────────────────────────

export async function addNoteComment(
  noteId: string,
  workspaceId: string,
  commentId: string,
  text: string,
  parentCommentId?: string,
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !commentId.trim() || !text.trim()) return;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    select: { status: true },
  });
  if (membership?.status !== "ACTIVE") return;

  await prisma.noteComment.create({
    data: {
      noteId,
      userId: currentUser.id,
      commentId,
      text: text.trim(),
      parentCommentId: parentCommentId ?? null,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
}

export async function resolveNoteComment(noteId: string, workspaceId: string, commentId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    select: { status: true },
  });
  if (membership?.status !== "ACTIVE") return;

  await prisma.noteComment.updateMany({
    where: { noteId, commentId, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
}

export async function deleteNoteComment(noteId: string, workspaceId: string, commentId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    select: { status: true },
  });
  if (membership?.status !== "ACTIVE") return;

  await prisma.noteComment.deleteMany({
    where: { noteId, commentId },
  });

  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
}

export async function addNoteCommentReply(
  noteId: string,
  workspaceId: string,
  parentCommentId: string,
  text: string,
) {
  await addNoteComment(noteId, workspaceId, crypto.randomUUID(), text, parentCommentId);
}

// ── Version snapshots ─────────────────────────────────────────────────────────

export async function saveNoteSnapshot(noteId: string, contentJson: unknown) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null },
    select: { id: true, ownerUserId: true, collaboration: true },
  });
  if (!note) return;
  if (note.ownerUserId !== currentUser.id && note.collaboration !== "COLLABORATIVE") return;

  await prisma.$transaction(async (tx) => {
    await tx.noteSnapshot.create({
      data: {
        noteId,
        userId: currentUser.id,
        contentJson: contentJson as Prisma.InputJsonValue,
      },
    });

    // Prune to keep at most 50 snapshots per note
    const count = await tx.noteSnapshot.count({ where: { noteId } });
    if (count > 50) {
      const oldest = await tx.noteSnapshot.findMany({
        where: { noteId },
        orderBy: { createdAt: "asc" },
        take: count - 50,
        select: { id: true },
      });
      await tx.noteSnapshot.deleteMany({ where: { id: { in: oldest.map((s) => s.id) } } });
    }
  });
}

export async function restoreNoteSnapshot(
  noteId: string,
  workspaceId: string,
  snapshotId: string,
): Promise<{ contentJson: unknown } | null> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return null;

  const [snapshot, note] = await Promise.all([
    prisma.noteSnapshot.findFirst({
      where: { id: snapshotId, noteId },
      select: { contentJson: true },
    }),
    prisma.note.findFirst({
      where: { id: noteId, workspaceId, deletedAt: null },
      select: { id: true, ownerUserId: true },
    }),
  ]);

  if (!snapshot || !note || note.ownerUserId !== currentUser.id) return null;

  await prisma.note.update({
    where: { id: note.id },
    data: { contentJson: snapshot.contentJson as Prisma.InputJsonValue },
  });

  revalidatePath(`/workspaces/${workspaceId}/notes/${noteId}`);
  return { contentJson: snapshot.contentJson };
}

function extractMentionIds(content: unknown): string[] {
  const ids: string[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "mention" && typeof n.attrs === "object" && n.attrs !== null) {
      const id = (n.attrs as Record<string, unknown>).id;
      if (typeof id === "string" && id) ids.push(id);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    walk(c.content ?? content);
  }
  return [...new Set(ids)];
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

function hasActiveMeetingPermissionBlock(
  note: {
    visibility: string;
    artifacts?: {
      id: string;
      source: string;
      meeting: {
        startsAt: Date;
        endsAt: Date | null;
        canceledAt: Date | null;
        createdByUserId: string;
        moderationSettings: Parameters<typeof canEditMeetingSharedNote>[0]["settings"];
        permissionOverrides: Parameters<typeof canEditMeetingSharedNote>[0]["overrides"];
      } | null;
    }[];
  },
  type: "TEXT" | "WHITEBOARD",
  currentUserId: string,
  currentUserRole: string,
) {
  if (note.visibility !== "WORKSPACE_SHARED") return false;
  return Boolean(
    note.artifacts?.some((artifact) => {
      if (artifact.source !== "CREATED_IN_MEETING" || !artifact.meeting) return false;
      if (!canEditMeetingNotes(getMeetingLifecycle(artifact.meeting))) return false;
      const checkFn = type === "WHITEBOARD" ? canEditMeetingWhiteboard : canEditMeetingSharedNote;
      return !checkFn({
        artifactId: artifact.id,
        currentUserId,
        meetingCreatedByUserId: artifact.meeting.createdByUserId,
        currentUserRole,
        settings: artifact.meeting.moderationSettings,
        overrides: artifact.meeting.permissionOverrides ?? [],
      });
    }),
  );
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
