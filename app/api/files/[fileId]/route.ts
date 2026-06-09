import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createAdminClient, getStorageBucketName } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{
    fileId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { fileId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to open this file." }, { status: 401 });
  }

  const file = await prisma.file.findUnique({
    where: {
      id: fileId,
    },
    select: {
      id: true,
      workspaceId: true,
      uploadedByUserId: true,
      name: true,
      mimeType: true,
      visibility: true,
      storageBucket: true,
      storageKey: true,
      recordingFor: { select: { meetingId: true } },
    },
  });

  if (!file?.workspaceId) {
    notFound();
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: file.workspaceId,
        userId: currentUser.id,
      },
    },
    select: {
      status: true,
    },
  });

  if (membership?.status !== "ACTIVE") {
    return NextResponse.json({ error: "You do not have access to this file." }, { status: 403 });
  }

  if (file.visibility === "PRIVATE" && file.uploadedByUserId !== currentUser.id) {
    return NextResponse.json({ error: "You do not have access to this file." }, { status: 403 });
  }

  // Recording files are only accessible to meeting participants
  if (file.recordingFor) {
    const participant = await prisma.meetingParticipant.findFirst({
      where: { meetingId: file.recordingFor.meetingId, userId: currentUser.id },
      select: { id: true },
    });
    if (!participant) {
      return NextResponse.json({ error: "You do not have access to this file." }, { status: 403 });
    }
  }

  if (file.storageKey.startsWith("uploads/")) {
    return serveLegacyPublicUpload(file);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(file.storageBucket ?? getStorageBucketName())
    .createSignedUrl(file.storageKey, 60);

  if (error || !data?.signedUrl) {
    logger.supabaseStorageError({ fileId: file.storageKey }, error ?? new Error("No signed URL returned"));
    return NextResponse.json({ error: "Could not open this file." }, { status: 404 });
  }

  const response = NextResponse.redirect(data.signedUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function serveLegacyPublicUpload(file: {
  name: string;
  mimeType: string;
  storageKey: string;
}) {
  const publicDirectory = path.join(process.cwd(), "public");
  const filePath = path.normalize(path.join(publicDirectory, file.storageKey));

  if (!filePath.startsWith(publicDirectory)) {
    return NextResponse.json({ error: "Invalid file path." }, { status: 400 });
  }

  try {
    const fileBuffer = await readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Content-Type": file.mimeType || "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not open this file." }, { status: 404 });
  }
}
