import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const maxMessageLength = 2000;

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceId, channelId, body } = parseBody(await readJson(request));

  if (!workspaceId || !channelId || !body) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (body.length > maxMessageLength) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const channel = await getAccessibleChannel(workspaceId, channelId, currentUser.id);

  if (!channel) {
    return NextResponse.json({ error: "You do not have permission to send messages here." }, { status: 403 });
  }

  const message = await prisma.message.create({
    data: {
      channelId: channel.id,
      senderUserId: currentUser.id,
      body,
    },
    include: messageInclude,
  });

  return NextResponse.json({ message: serializeMessage(message) });
}

export async function PATCH(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceId, messageId, body } = parseBody(await readJson(request));

  if (!workspaceId || !messageId || !body) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (body.length > maxMessageLength) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      senderUserId: currentUser.id,
      deletedAt: null,
      channel: {
        workspaceId,
        workspace: {
          members: {
            some: {
              userId: currentUser.id,
              status: "ACTIVE",
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!message) {
    return NextResponse.json({ error: "You do not have permission to edit this message." }, { status: 403 });
  }

  const updatedMessage = await prisma.message.update({
    where: {
      id: message.id,
    },
    data: {
      body,
      editedAt: new Date(),
    },
    include: messageInclude,
  });

  return NextResponse.json({ message: serializeMessage(updatedMessage) });
}

export async function DELETE(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { workspaceId, messageId } = parseBody(await readJson(request));

  if (!workspaceId || !messageId) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const [membership, message] = await Promise.all([
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
    prisma.message.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
        channel: {
          workspaceId,
        },
      },
      select: {
        id: true,
        senderUserId: true,
      },
    }),
  ]);

  const canModerate = membership?.role === "OWNER" || membership?.role === "ADMIN";

  if (membership?.status !== "ACTIVE" || !message || (message.senderUserId !== currentUser.id && !canModerate)) {
    return NextResponse.json({ error: "You do not have permission to delete this message." }, { status: 403 });
  }

  const deletedMessage = await prisma.message.update({
    where: {
      id: message.id,
    },
    data: {
      deletedAt: new Date(),
    },
    include: messageInclude,
  });

  return NextResponse.json({ message: serializeMessage(deletedMessage) });
}

async function getAccessibleChannel(workspaceId: string, channelId: string, userId: string) {
  return prisma.channel.findFirst({
    where: {
      id: channelId,
      workspaceId,
      workspace: {
        members: {
          some: {
            userId,
            status: "ACTIVE",
          },
        },
      },
    },
    select: {
      id: true,
    },
  });
}

const messageInclude = {
  sender: {
    select: {
      displayName: true,
    },
  },
} as const;

function serializeMessage(message: {
  id: string;
  channelId: string;
  senderUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  sender: {
    displayName: string;
  };
}) {
  return {
    id: message.id,
    channelId: message.channelId,
    senderUserId: message.senderUserId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    sender: message.sender,
  };
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      workspaceId: "",
      channelId: "",
      messageId: "",
      body: "",
    };
  }

  const maybeBody = body as {
    workspaceId?: unknown;
    channelId?: unknown;
    messageId?: unknown;
    body?: unknown;
  };

  return {
    workspaceId: typeof maybeBody.workspaceId === "string" ? maybeBody.workspaceId : "",
    channelId: typeof maybeBody.channelId === "string" ? maybeBody.channelId : "",
    messageId: typeof maybeBody.messageId === "string" ? maybeBody.messageId : "",
    body: typeof maybeBody.body === "string" ? maybeBody.body.trim() : "",
  };
}
