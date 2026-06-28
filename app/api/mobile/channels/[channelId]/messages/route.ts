import { NextResponse } from "next/server";
import { after } from "next/server";
import type { MobileMessageResponse, MobileMessagesResponse } from "@scribbl/shared";
import {
  createChatMessage,
  createChatMessageNotifications,
  logChatNotificationFailure,
} from "@/lib/chat-message-write";
import { getCurrentMobileUser } from "@/lib/mobile-auth";
import {
  getAccessibleChannel,
  mobileForbidden,
  mobileUnauthorized,
  serializeMessage,
} from "@/lib/mobile-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

  const { channelId } = await context.params;
  const body = await readMessageBody(request);
  const result = await createChatMessage({
    user,
    channelId,
    body,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  after(() => {
    void createChatMessageNotifications(result.notification).catch((error: unknown) => {
      logChatNotificationFailure({
        workspaceId: result.notification.workspaceId,
        channelId: result.notification.channelId,
      }, error);
    });
  });

  const response: MobileMessageResponse = {
    message: serializeMessage(result.message),
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
