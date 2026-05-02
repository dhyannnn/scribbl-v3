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
        include: {
          meeting: {
            select: {
              id: true,
              startsAt: true,
              canceledAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
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
          include: {
            sender: true,
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
  const activeChannelPayload = activeChannel
    ? {
        id: activeChannel.id,
        name: getChannelDisplayName(activeChannel),
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
          },
        })),
      }
    : null;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[260px_1fr] lg:px-10">
        <aside className="rounded-md border border-[#d8d8ce] bg-white p-4 shadow-sm">
          <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <h1 className="mt-5 text-2xl font-semibold">Channels</h1>
          <div className="mt-4 grid gap-2">
            {workspace.channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/workspaces/${workspace.id}/chat?channel=${channel.id}`}
                className={`min-w-0 rounded-md px-3 py-2 text-sm font-medium transition ${
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
          canModerateChat={canModerateChat}
          status={chatStatus}
          title={activeChannel?.meetingId ? "Meeting Chat" : "Course Chat"}
          emptyText="No messages in this channel yet."
          placeholder={`Message ${activeChannel ? getChannelDisplayName(activeChannel) : "#general"}`}
          maxMessagesHeightClassName="max-h-[620px]"
        />
      </div>
    </main>
  );
}

type ChannelDisplay = {
  name: string;
  meetingId: string | null;
};

function getChannelDisplayName(channel: ChannelDisplay) {
  return channel.meetingId ? channel.name : `#${channel.name}`;
}
