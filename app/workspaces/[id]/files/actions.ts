"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";
import { createAdminClient, getStorageBucketName } from "@/lib/supabase/admin";

const fileVisibilities = ["PRIVATE", "WORKSPACE_SHARED"] as const;
const maxUploadBytes = 20 * 1024 * 1024;

export async function uploadWorkspaceFile(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const visibilityValue = String(formData.get("visibility") ?? "WORKSPACE_SHARED");
  const uploadedFile = formData.get("file");

  if (!workspaceId) {
    return;
  }

  if (!(uploadedFile instanceof File) || uploadedFile.size <= 0) {
    redirect(`/workspaces/${workspaceId}/files?file=upload-invalid`);
  }

  if (uploadedFile.size > maxUploadBytes) {
    redirect(`/workspaces/${workspaceId}/files?file=upload-too-large`);
  }

  if (!fileVisibilities.includes(visibilityValue as (typeof fileVisibilities)[number])) {
    redirect(`/workspaces/${workspaceId}/files?file=upload-invalid`);
  }

  const visibility = visibilityValue as (typeof fileVisibilities)[number];
  const safeFileName = sanitizeFileName(uploadedFile.name);

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
    redirect(workspaceId ? `/workspaces/${workspaceId}/files?file=upload-invalid` : "/");
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
    redirect(`/workspaces/${workspace.id}/files?file=unauthorized`);
  }

  // Storage limit check — before rate limit to avoid consuming a slot for a blocked upload
  const workspaceWithPlan = await prisma.workspace.findUnique({
    where: { id: workspace.id },
    select: { plan: true },
  });
  const plan = workspaceWithPlan?.plan ?? "FREE";
  const {
    getWorkspaceSharedStorageBytes,
    getSharedStorageLimitBytes,
    getUserPrivateStorageBytes,
    getPrivateStorageLimitPerUserBytes,
  } = await import("@/lib/billing");

  if (visibility === "WORKSPACE_SHARED") {
    const [currentShared, sharedLimit] = await Promise.all([
      getWorkspaceSharedStorageBytes(workspace.id),
      Promise.resolve(getSharedStorageLimitBytes(plan)),
    ]);
    if (currentShared + uploadedFile.size > sharedLimit) {
      redirect(`/workspaces/${workspace.id}/files?file=storage-limit`);
    }
  } else {
    const [currentPrivate, privateLimit] = await Promise.all([
      getUserPrivateStorageBytes(currentUser.id, workspace.id),
      Promise.resolve(getPrivateStorageLimitPerUserBytes(plan)),
    ]);
    if (currentPrivate + uploadedFile.size > privateLimit) {
      redirect(`/workspaces/${workspace.id}/files?file=private-storage-limit`);
    }
  }

  if (!await RateLimits.fileUpload(currentUser.id)) {
    redirect(`/workspaces/${workspace.id}/files?file=upload-rate-limited`);
  }

  const uploadId = crypto.randomUUID();
  const storedFileName = `${uploadId}-${safeFileName}`;
  const storageKey = `workspaces/${workspace.id}/files/${storedFileName}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(getStorageBucketName()).upload(storageKey, uploadedFile, {
    contentType: uploadedFile.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    redirect(`/workspaces/${workspace.id}/files?file=upload-failed`);
  }

  try {
    await prisma.file.create({
      data: {
        workspaceId: workspace.id,
        uploadedByUserId: currentUser.id,
        name: safeFileName,
        mimeType: uploadedFile.type || "application/octet-stream",
        sizeBytes: uploadedFile.size,
        visibility,
        storageKey,
        publicUrl: null,
      },
    });
  } catch {
    await supabase.storage.from(getStorageBucketName()).remove([storageKey]);
    redirect(`/workspaces/${workspace.id}/files?file=upload-failed`);
  }

  revalidatePath(`/workspaces/${workspace.id}`);
  revalidatePath(`/workspaces/${workspace.id}/files`);
  revalidatePath("/");
  redirect(`/workspaces/${workspace.id}/files?file=uploaded`);
}

export async function deleteWorkspaceFile(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  if (!workspaceId || !fileId) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/files`)}`);
  }

  const [membership, file] = await Promise.all([
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
    prisma.file.findFirst({
      where: {
        id: fileId,
        workspaceId,
      },
      select: {
        id: true,
        name: true,
        uploadedByUserId: true,
        visibility: true,
        storageBucket: true,
        storageKey: true,
        noteContentFor: {
          select: {
            id: true,
          },
        },
        artifacts: {
          select: {
            id: true,
            meetingId: true,
          },
        },
      },
    }),
  ]);

  if (membership?.status !== "ACTIVE" || !file) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  const canManageWorkspaceFiles = membership.role === "OWNER" || membership.role === "ADMIN";
  const canDelete =
    file.visibility === "WORKSPACE_SHARED"
      ? file.uploadedByUserId === currentUser.id || canManageWorkspaceFiles
      : file.uploadedByUserId === currentUser.id;

  if (!canDelete) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  if (file.noteContentFor) {
    redirect(`/workspaces/${workspaceId}/files?file=delete-attached`);
  }

  if (!file.storageKey.startsWith("uploads/")) {
    const supabase = createAdminClient();
    const recordingsBucket = process.env.RECORDINGS_S3_BUCKET;
    const isRecordingFile = recordingsBucket && file.storageBucket === recordingsBucket;

    const { error } = await supabase.storage
      .from(file.storageBucket ?? getStorageBucketName())
      .remove([file.storageKey]);

    if (error && !isRecordingFile) {
      // For regular Supabase Storage files, a storage error means we must abort
      // to avoid orphaning a DB record that has no backing object.
      redirect(`/workspaces/${workspaceId}/files?file=delete-failed`);
    }
    // Recording files live in external S3 — the Supabase client can't reach them.
    // If deletion fails, log but continue so the DB record (and storage quota) is freed.
    if (error && isRecordingFile) {
      console.error("[deleteWorkspaceFile] could not delete recording from S3, proceeding with DB cleanup", file.storageKey);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.meetingArtifact.deleteMany({
      where: {
        fileId: file.id,
      },
    });

    await tx.file.delete({
      where: {
        id: file.id,
      },
    });
  });

  void writeAuditLog({
    action: "FILE_DELETED",
    actorUserId: currentUser.id,
    workspaceId,
    targetId: file.id,
    metadata: { name: file.name, visibility: file.visibility },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/files`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  for (const artifact of file.artifacts) {
    revalidatePath(`/workspaces/${workspaceId}/meetings/${artifact.meetingId}`);
  }
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/files?file=deleted`);
}

export async function updateWorkspaceFile(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  const name = sanitizeFileName(String(formData.get("name") ?? ""));

  if (!workspaceId || !fileId || !name) {
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/files`)}`);
  }

  const [membership, file] = await Promise.all([
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
    prisma.file.findFirst({
      where: {
        id: fileId,
        workspaceId,
      },
      select: {
        id: true,
        uploadedByUserId: true,
        visibility: true,
        artifacts: {
          select: {
            meetingId: true,
          },
        },
      },
    }),
  ]);

  if (membership?.status !== "ACTIVE" || !file) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  const canManageWorkspaceFiles = membership.role === "OWNER" || membership.role === "ADMIN";
  const canUpdate =
    file.visibility === "WORKSPACE_SHARED"
      ? file.uploadedByUserId === currentUser.id || canManageWorkspaceFiles
      : file.uploadedByUserId === currentUser.id;

  if (!canUpdate) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  await prisma.file.update({
    where: {
      id: file.id,
    },
    data: {
      name,
    },
  });

  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/files`);
  revalidatePath(`/workspaces/${workspaceId}/meetings`);
  for (const artifact of file.artifacts) {
    revalidatePath(`/workspaces/${workspaceId}/meetings/${artifact.meetingId}`);
  }
  revalidatePath("/");
  redirect(`/workspaces/${workspaceId}/files?file=updated`);
}

export async function togglePinFile(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");

  if (!workspaceId || !fileId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect(`/login?next=${encodeURIComponent(`/workspaces/${workspaceId}/files`)}`);
  }

  const [membership, file] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.file.findFirst({
      where: { id: fileId, workspaceId, visibility: "WORKSPACE_SHARED" },
      select: { id: true, isPinned: true },
    }),
  ]);

  if (membership?.status !== "ACTIVE" || !file) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  const canPin = membership.role === "OWNER" || membership.role === "ADMIN";
  if (!canPin) {
    redirect(`/workspaces/${workspaceId}/files?file=unauthorized`);
  }

  // Cap pinned files per workspace at 10
  if (!file.isPinned) {
    const pinnedCount = await prisma.file.count({
      where: { workspaceId, isPinned: true, visibility: "WORKSPACE_SHARED" },
    });
    if (pinnedCount >= 10) {
      redirect(`/workspaces/${workspaceId}/files?file=pin-limit`);
    }
  }

  await prisma.file.update({
    where: { id: fileId },
    data: { isPinned: !file.isPinned },
  });

  revalidatePath(`/workspaces/${workspaceId}/files`);
  revalidatePath(`/workspaces/${workspaceId}/chat`);
  redirect(`/workspaces/${workspaceId}/files?file=${file.isPinned ? "unpinned" : "pinned"}`);
}

function sanitizeFileName(fileName: string) {
  const trimmedName = fileName.trim() || "upload";
  const sanitizedName = trimmedName
    .replaceAll(/[/\\]/g, "-")
    .replaceAll(/[^a-zA-Z0-9._ -]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return sanitizedName || "upload";
}
