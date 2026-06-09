import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getSharedStorageLimitBytes, getWorkspaceSharedStorageBytes } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { createAdminClient, getStorageBucketName } from "@/lib/supabase/admin";

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const file = formData.get("file");

  if (!workspaceId || !(file instanceof File)) {
    return NextResponse.json({ error: "workspaceId and file are required." }, { status: 400 });
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    return NextResponse.json({ error: "File is too large. Maximum is 25 MB." }, { status: 400 });
  }

  // Check workspace membership
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
    select: { status: true, workspace: { select: { plan: true } } },
  });

  if (membership?.status !== "ACTIVE") {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  // Storage quota check
  const [usedBytes, limitBytes] = await Promise.all([
    getWorkspaceSharedStorageBytes(workspaceId),
    Promise.resolve(getSharedStorageLimitBytes(membership.workspace.plan)),
  ]);

  if (usedBytes + file.size > limitBytes) {
    return NextResponse.json({ error: "Workspace shared storage limit reached." }, { status: 413 });
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `chat-attachments/${workspaceId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bucket = getStorageBucketName();

  const supabase = createAdminClient();
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  const fileRecord = await prisma.file.create({
    data: {
      workspaceId,
      uploadedByUserId: currentUser.id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      visibility: "WORKSPACE_SHARED",
      storageBucket: bucket,
      storageKey: storagePath,
      publicUrl: null,
    },
    select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true },
  });

  return NextResponse.json({ file: fileRecord });
}
