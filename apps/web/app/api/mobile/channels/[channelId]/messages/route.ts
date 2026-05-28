import { NextResponse } from "next/server";
import type { MobileMessageResponse, MobileMessagesResponse } from "@scribbl/shared";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import {
  getAccessibleChannel,
  mobileBadRequest,
  mobileForbidden,
  mobileUnauthorized,
  serializeMessage,
} from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";
import { RateLimits } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const maxMessageLength = 2000;

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  const { channelId } = await context.params;
  const channel = await getAccessibleChannel(channelId, user.id);
  if (!channel) return mobileForbidden();

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null },
    select: {
      id: true,
      channelId: true,
      body: true,
      createdAt: true,
      editedAt: true,
      isPinned: true,
      sender: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const response: MobileMessagesResponse = {
    messages: messages.reverse().map(serializeMessage),
  };

  return NextResponse.json(response);
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentMobileUser(request);
  if (!user) return mobileUnauthorized();

  if (!RateLimits.chatSend(user.id)) {
    return NextResponse.json({ error: "Too many messages. Slow down." }, { status: 429 });
  }

  const { channelId } = await context.params;
  const channel = await getAccessibleChannel(channelId, user.id);
  if (!channel) return mobileForbidden();

  const body = await readMessageBody(request);
  if (!body) return mobileBadRequest("Message is required.");
  if (body.length > maxMessageLength) return mobileBadRequest("Message is too long.");

  if (channel.type === "ANNOUNCEMENT") {
    const role = channel.workspace.members[0]?.role;
    if (role !== "OWNER" && role !== "ADMIN") {
      return NextResponse.json({ error: "Only workspace admins can post announcements." }, { status: 403 });
    }
  }

  const message = await prisma.message.create({
    data: {
      channelId,
      senderUserId: user.id,
      body,
    },
    select: {
      id: true,
      channelId: true,
      body: true,
      createdAt: true,
      editedAt: true,
      isPinned: true,
      sender: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const response: MobileMessageResponse = {
    message: serializeMessage(message),
  };

  return NextResponse.json(response);
}

async function readMessageBody(request: Request) {
  try {
    const json = await request.json();
    return typeof json.body === "string" ? json.body.trim() : "";
  } catch {
    return "";
  }
}
