import { NextResponse } from "next/server";
import {
  meetingWebPath,
  noteWebPath,
  type MobileChannel,
  type MobileChatMessage,
  type MobileMeeting,
  type MobileNoteDetail,
  type MobileNoteSummary,
  type MobileWorkspace,
} from "@scribbl/shared";
import { canJoinMeeting, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

export function mobileUnauthorized() {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

export function mobileForbidden() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
}

export function mobileBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function getActiveMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, status: true },
  });
}

export async function canAccessWorkspace(workspaceId: string, userId: string) {
  const membership = await getActiveMembership(workspaceId, userId);
  return membership?.status === "ACTIVE";
}

export function serializeWorkspace(membership: {
  role: MobileWorkspace["role"];
  workspace: {
    id: string;
    name: string;
    type: MobileWorkspace["type"];
    plan: MobileWorkspace["plan"];
    description: string | null;
    _count: { members: number };
  };
}): MobileWorkspace {
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    type: membership.workspace.type,
    plan: membership.workspace.plan,
    description: membership.workspace.description,
    role: membership.role,
    memberCount: membership.workspace._count.members,
  };
}

export function serializeMeeting(meeting: {
  id: string;
  workspaceId: string | null;
  title: string;
  description: string | null;
  type: MobileMeeting["type"];
  startsAt: Date;
  endsAt: Date | null;
  canceledAt: Date | null;
  workspace: { name: string } | null;
  participants: { status: MobileMeeting["participantStatus"] }[];
}): MobileMeeting | null {
  if (!meeting.workspaceId || !meeting.workspace) {
    return null;
  }

  return {
    id: meeting.id,
    workspaceId: meeting.workspaceId,
    workspaceName: meeting.workspace.name,
    title: meeting.title,
    description: meeting.description,
    type: meeting.type,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt?.toISOString() ?? null,
    canceledAt: meeting.canceledAt?.toISOString() ?? null,
    participantStatus: meeting.participants[0]?.status ?? null,
    canJoinVideo: meeting.participants.length > 0 && canJoinMeeting(getMeetingLifecycle(meeting)),
    webPath: meetingWebPath(meeting.workspaceId, meeting.id),
  };
}

export function serializeNoteSummary(note: {
  id: string;
  workspaceId: string | null;
  title: string;
  type: MobileNoteSummary["type"];
  visibility: MobileNoteSummary["visibility"];
  updatedAt: Date;
  owner: { displayName: string };
}): MobileNoteSummary {
  return {
    id: note.id,
    workspaceId: note.workspaceId,
    title: note.title,
    type: note.type,
    visibility: note.visibility,
    updatedAt: note.updatedAt.toISOString(),
    ownerName: note.owner.displayName,
    webPath: noteWebPath(note.workspaceId, note.id),
  };
}

export function serializeNoteDetail(note: Parameters<typeof serializeNoteSummary>[0] & {
  contentJson: unknown;
}): MobileNoteDetail {
  return {
    ...serializeNoteSummary(note),
    contentText: extractTextFromTiptapJson(note.contentJson),
    canEditInMobile: false,
  };
}

export function serializeChannel(channel: {
  id: string;
  workspaceId: string;
  name: string;
  type: MobileChannel["type"];
  updatedAt: Date;
}): MobileChannel {
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    type: channel.type,
    updatedAt: channel.updatedAt.toISOString(),
  };
}

export function serializeMessage(message: {
  id: string;
  channelId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  isPinned: boolean;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}): MobileChatMessage {
  return {
    id: message.id,
    channelId: message.channelId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    isPinned: message.isPinned,
    sender: message.sender,
  };
}

export async function getAccessibleChannel(channelId: string, userId: string) {
  return prisma.channel.findFirst({
    where: {
      id: channelId,
      workspace: {
        members: { some: { userId, status: "ACTIVE" } },
      },
      OR: [
        { type: { not: "DIRECT" } },
        { dmUser1Id: userId },
        { dmUser2Id: userId },
      ],
    },
    select: {
      id: true,
      workspaceId: true,
      type: true,
      name: true,
      workspace: {
        select: {
          members: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
      },
    },
  });
}

function extractTextFromTiptapJson(value: unknown): string {
  const chunks: string[] = [];

  function visit(node: unknown) {
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as { text?: unknown; content?: unknown; type?: unknown };
    if (typeof record.text === "string") {
      chunks.push(record.text);
    }
    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        visit(child);
      }
      if (record.type === "paragraph" || record.type === "heading") {
        chunks.push("\n");
      }
    }
  }

  visit(value);
  return chunks.join("").replace(/\n{3,}/g, "\n\n").trim();
}
