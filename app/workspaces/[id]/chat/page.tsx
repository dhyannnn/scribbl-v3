import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { RealtimeChatPanel } from "@/components/RealtimeChatPanel";
import { getCurrentUser } from "@/lib/current-user";
import { createChatRoomId } from "@/lib/liveblocks-room";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; chat?: string }>;
};

export default async function ChatPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { channel: selectedChannelId, chat: chatStatus } = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      members: {
        where: {
          status: "ACTIVE",
        },
        select: {
          userId: true,
          role: true,
        },
      },
      channels: {
        where: {
          OR: [
            {
              meetingId: null,
            },
            {
              meeting: {
                canceledAt: null,
              },
            },
          ],
        },
        include: {
          meeting: {
            select: {
              id: true,
              startsAt: true,
              canceledAt: true,
            },
          },
        },
        orderBy: [{ type: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!workspace) {
    notFound();
  }

  if (!workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const activeChannel =
    workspace.channels.find((channel) => channel.id === selectedChannelId) ??
    workspace.channels.find((channel) => !channel.meetingId) ??
    workspace.channels[0];
  const activeChannelMessages = activeChannel
    ? (
        await prisma.message.findMany({
          where: {
            channelId: activeChannel.id,
          },
          select: {
            id: true,
            channelId: true,
            senderUserId: true,
            body: true,
            createdAt: true,
            editedAt: true,
            deletedAt: true,
            sender: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        })
      ).reverse()
    : [];
  const currentMembership = workspace.members.find((member) => member.userId === currentUser.id);
  const canModerateChat = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const canPostMessages = activeChannel?.type !== "ANNOUNCEMENT" || canModerateChat;
  const activeChannelPayload = activeChannel
    ? {
        id: activeChannel.id,
        name: getChannelDisplayName(activeChannel),
        type: activeChannel.type,
        messages: activeChannelMessages.map((message) => ({
          id: message.id,
          channelId: message.channelId,
          senderUserId: message.senderUserId,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          editedAt: message.editedAt?.toISOString() ?? null,
          deletedAt: message.deletedAt?.toISOString() ?? null,
          sender: {
            displayName: message.sender.displayName,
            avatarUrl: message.sender.avatarUrl,
          },
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-10">
        <aside className="min-w-0 rounded-md border border-[#d8d8ce] bg-white p-4 shadow-sm">
          <Link href={`/workspaces/${workspace.id}`} className="block truncate text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <div className="mt-5 flex items-end justify-between gap-3 lg:block">
            <h1 className="text-2xl font-semibold">Channels</h1>
            <span className="shrink-0 text-xs font-medium text-[#777970] lg:hidden">
              {workspace.channels.length}
            </span>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
            {workspace.channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/workspaces/${workspace.id}/chat?channel=${channel.id}`}
                className={`min-w-[160px] max-w-[240px] shrink-0 rounded-md px-3 py-2 text-sm font-medium transition lg:min-w-0 lg:max-w-none lg:shrink ${
                  channel.id === activeChannel?.id
                    ? "bg-[#2f604b] text-white"
                    : "bg-[#e7eee7] text-[#2f604b] hover:bg-[#dce8dd]"
                }`}
                title={getChannelDisplayName(channel)}
              >
                <span className="block truncate">{getChannelDisplayName(channel)}</span>
                {channel.meeting?.canceledAt ? (
                  <span className="mt-1 block text-xs opacity-80">canceled</span>
                ) : null}
              </Link>
            ))}
          </div>
        </aside>

        <RealtimeChatPanel
          workspaceId={workspace.id}
          roomId={activeChannel ? createChatRoomId(workspace.id, activeChannel.id) : createChatRoomId(workspace.id, "empty")}
          channel={activeChannelPayload}
          currentUserId={currentUser.id}
          currentUserDisplayName={currentUser.displayName}
          currentUserAvatarUrl={currentUser.avatarUrl}
          canModerateChat={canModerateChat}
          status={chatStatus}
          title={activeChannel?.type === "ANNOUNCEMENT" ? "Announcements" : activeChannel?.meetingId ? "Meeting Chat" : "Course Chat"}
          emptyText={activeChannel?.type === "ANNOUNCEMENT" ? "No announcements yet." : "No messages in this channel yet."}
          placeholder={`Message ${activeChannel ? getChannelDisplayName(activeChannel) : "#general"}`}
          canPostMessages={canPostMessages}
          readOnlyText="Only workspace owners and admins can post announcements."
          maxMessagesHeightClassName="max-h-[620px]"
        />
      </div>
    </main>
  );
}

type ChannelDisplay = {
  name: string;
  type?: string;
  meetingId: string | null;
  meeting?: {
    startsAt: Date;
    canceledAt: Date | null;
  } | null;
};

function getChannelDisplayName(channel: ChannelDisplay) {
  if (channel.type === "ANNOUNCEMENT") {
    return "Announcements";
  }

  if (!channel.meetingId) {
    return `#${channel.name}`;
  }

  const startsAt = channel.meeting?.startsAt;

  if (!startsAt) {
    return channel.name;
  }

  return `${channel.name} / ${startsAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
