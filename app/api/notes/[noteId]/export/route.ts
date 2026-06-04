import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createNotePdfBuffer, createPdfFileName } from "@/lib/pdf/note-export";
import { prisma } from "@/lib/prisma";

type RouteProps = {
  params: Promise<{
    noteId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { noteId } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Sign in to export this note." }, { status: 401 });
  }

  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      deletedAt: null,
    },
    include: {
      owner: true,
      workspace: {
        include: {
          members: {
            where: {
              userId: currentUser.id,
            },
            select: {
              role: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!note?.workspace) {
    notFound();
  }

  const membership = note.workspace.members[0];

  if (membership?.status !== "ACTIVE") {
    return NextResponse.json({ error: "You do not have access to this note." }, { status: 403 });
  }

  if (!canExportNote({
    currentUserId: currentUser.id,
    exportAccess: note.exportAccess,
    membershipRole: membership.role,
    ownerUserId: note.ownerUserId,
    visibility: note.visibility,
  })) {
    return NextResponse.json({ error: "You do not have permission to export this note." }, { status: 403 });
  }

  const pdfBuffer = await createNotePdfBuffer({
    title: note.title,
    type: note.type,
    ownerName: note.owner.displayName,
    workspaceName: note.workspace.name,
    updatedAt: note.updatedAt,
    contentJson: note.contentJson,
    orientation: note.orientation,
    marginTop: note.marginTop,
    marginBottom: note.marginBottom,
    marginLeft: note.marginLeft,
    marginRight: note.marginRight,
  });
  const response = new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${sanitizeHeaderValue(createPdfFileName(note.title))}"`,
      "Content-Type": "application/pdf",
    },
  });

  return response;
}

function canExportNote({
  currentUserId,
  exportAccess,
  membershipRole,
  ownerUserId,
  visibility,
}: {
  currentUserId: string;
  exportAccess: string;
  membershipRole: string;
  ownerUserId: string;
  visibility: string;
}) {
  if (visibility === "PRIVATE") {
    return ownerUserId === currentUserId;
  }

  if (exportAccess === "WORKSPACE_MEMBERS") {
    return true;
  }

  return ownerUserId === currentUserId || membershipRole === "OWNER" || membershipRole === "ADMIN";
}

function sanitizeHeaderValue(value: string) {
  return value.replaceAll(/["\r\n]/g, "");
}
