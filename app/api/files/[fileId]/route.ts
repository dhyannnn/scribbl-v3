import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
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
      storageKey: true,
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

  if (file.storageKey.startsWith("uploads/")) {
    return serveLegacyPublicUpload(file);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(getStorageBucketName())
    .createSignedUrl(file.storageKey, 60);

  if (error || !data?.signedUrl) {
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
        "Content-Disposition": `inline; filename="${sanitizeHeaderValue(file.name)}"`,
        "Content-Type": file.mimeType || "application/octet-stream",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not open this file." }, { status: 404 });
  }
}

function sanitizeHeaderValue(value: string) {
  return value.replaceAll(/["\r\n]/g, "");
}
