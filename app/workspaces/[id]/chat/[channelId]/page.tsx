import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { RealtimeChatPanel } from "@/components/RealtimeChatPanel";
import { ChatPanelResizer } from "@/components/ChatPanelResizer";
import { MarkChannelRead } from "@/components/MarkChannelRead";
import { getCurrentUser } from "@/lib/current-user";
import { createChatRoomId } from "@/lib/liveblocks-room";
import { shapePoll } from "@/lib/polls";
import { prisma } from "@/lib/prisma";
import { createChannel, deleteChannel } from "../actions";

type PageProps = {
  params: Promise<{ id: string; channelId: string }>;
  searchParams: Promise<{ chat?: string }>;
};

export default async function ChannelPage({ params, searchParams }: PageProps) {
  const { id: workspaceId, channelId } = await params;
  const { chat: chatStatus } = await searchParams;
  const currentUser = await getCurrentUser();

  if (!currentUser) return <ProtectedPageMessage />;

  const [channel, membership, allChannels] = await Promise.all([
    prisma.channel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        name: true,
        type: true,
        meetingId: true,
        dmUser1Id: true,
        dmUser2Id: true,
        dmUser1: { select: { id: true, displayName: true, avatarUrl: true } },
        dmUser2: { select: { id: true, displayName: true, avatarUrl: true } },
        meeting: { select: { id: true, title: true } },
        workspace: { select: { id: true, name: true } },
      },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
    prisma.channel.findMany({
      where: {
        workspaceId,
        type: { not: "DIRECT" },
        OR: [
          { meetingId: null },
          { meetingId: { not: null }, type: "CHAT", meeting: { canceledAt: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        meetingId: true,
        meeting: { select: { title: true, startsAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!channel) notFound();

  if (!membership || membership.status !== "ACTIVE") {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";
  const canPost = channel.type !== "ANNOUNCEMENT" || canManage;
  const isMeetingChannel = !!channel.meetingId;
  const isDm = channel.type === "DIRECT";

  const dmOtherUser = isDm
    ? (channel.dmUser1Id === currentUser.id ? channel.dmUser2 : channel.dmUser1)
    : null;

  const displayName = isDm
    ? (dmOtherUser?.displayName ?? "Direct Message")
    : channel.type === "ANNOUNCEMENT"
    ? "Announcements"
    : isMeetingChannel
    ? (channel.meeting?.title ?? channel.name)
    : `#${channel.name}`;

  // Fetch right panel data in parallel with messages
  const [messages, recentNotes, pinnedFiles, members, rawPolls] = await Promise.all([
    prisma.message.findMany({
      where: { channelId, deletedAt: null },
      select: {
        id: true, channelId: true, senderUserId: true, body: true,
        createdAt: true, editedAt: true, deletedAt: true,
        isPinned: true, replyToId: true,
        sender: { select: { displayName: true, avatarUrl: true } },
        replyTo: { select: { id: true, body: true, sender: { select: { displayName: true } } } },
        reactions: { select: { emoji: true, userId: true } },
        attachmentFile: { select: { id: true, name: true, mimeType: true, sizeBytes: true, publicUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.note.findMany({
      where: { workspaceId, deletedAt: null, visibility: "WORKSPACE_SHARED" },
      select: { id: true, title: true, type: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    prisma.file.findMany({
      where: { workspaceId, isPinned: true, visibility: "WORKSPACE_SHARED" },
      select: { id: true, name: true, mimeType: true, sizeBytes: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: {
        role: true,
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.poll.findMany({
      where: { channelId, meetingId: null },
      select: {
        id: true, question: true, options: true, createdByUserId: true,
        closedAt: true, createdAt: true, updatedAt: true,
        createdBy: { select: { displayName: true } },
        votes: { select: { userId: true, optionIndex: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const initialPolls = rawPolls.map((p) => shapePoll(p, currentUser.id));

  const channelPayload = {
    id: channel.id,
    name: displayName,
    type: channel.type,
    messages: messages.reverse().map((m) => {
      const reactionMap = new Map<string, string[]>();
      for (const r of m.reactions) {
        const arr = reactionMap.get(r.emoji) ?? [];
        arr.push(r.userId);
        reactionMap.set(r.emoji, arr);
      }
      return {
        id: m.id, channelId: m.channelId, senderUserId: m.senderUserId,
        body: m.body, createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null, deletedAt: m.deletedAt?.toISOString() ?? null,
        isPinned: m.isPinned, replyToId: m.replyToId,
        replyTo: m.replyTo ?? null,
        reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({ emoji, userIds })),
        attachmentFile: m.attachmentFile ?? null,
        sender: { displayName: m.sender.displayName, avatarUrl: m.sender.avatarUrl },
      };
    }),
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <MarkChannelRead channelId={channelId} workspaceId={workspaceId} />
      {/* Channel header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5">
        <div className="flex items-center gap-2.5">
          {isMeetingChannel ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-subtle)]">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          ) : channel.type === "ANNOUNCEMENT" ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-subtle)]">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
            </svg>
          ) : (
            <span className="font-mono text-sm font-semibold text-[var(--color-subtle)]">#</span>
          )}
          <h1 className="text-sm font-semibold text-[var(--color-text)]">{displayName}</h1>
          {isMeetingChannel && channel.meetingId ? (
            <Link
              href={`/workspaces/${workspaceId}/meetings/${channel.meetingId}`}
              className="ml-1 font-mono text-xs text-[var(--color-secondary)] hover:underline"
            >
              Open meeting ↗
            </Link>
          ) : null}
        </div>
        {canManage && channel.type === "CHAT" && !isMeetingChannel ? (
          <form action={deleteChannel}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="channelId" value={channelId} />
            <PendingSubmitButton
              pendingLabel="Deleting..."
              className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] disabled:opacity-60"
            >
              Delete channel
            </PendingSubmitButton>
          </form>
        ) : null}
      </header>

      {/* Body — padded, gap between cards */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        {/* Chat card */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <RealtimeChatPanel
            workspaceId={workspaceId}
            roomId={createChatRoomId(workspaceId, channelId)}
            channel={channelPayload}
            currentUserId={currentUser.id}
            currentUserDisplayName={currentUser.displayName}
            currentUserAvatarUrl={currentUser.avatarUrl}
            canModerateChat={canManage}
            initialPolls={initialPolls}
            canCreatePolls={canPost}
            status={chatStatus}
            title={displayName}
            emptyText={
              channel.type === "ANNOUNCEMENT"
                ? "No announcements yet."
                : isMeetingChannel
                  ? "No messages in this meeting chat yet."
                  : "No messages yet. Say hello!"
            }
            placeholder={`Message ${displayName}...`}
            canPostMessages={canPost}
            readOnlyText="Only workspace owners and admins can post announcements."
            variant="fullscreen"
            members={members.map((m) => ({ id: m.user.id, displayName: m.user.displayName, avatarUrl: m.user.avatarUrl }))}
          />
        </div>

        {/* Drag handle */}
        <ChatPanelResizer />

        {/* Right panel card */}
        <aside data-chat-right-panel className="hidden overflow-hidden overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm xl:flex xl:flex-col">

          {/* Recent Notes */}
          <section className="border-b border-[var(--color-border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Recent Notes
              </p>
              <Link href={`/workspaces/${workspaceId}/notes`} className="font-mono text-xs text-[var(--color-secondary)] hover:underline">
                View all
              </Link>
            </div>
            {recentNotes.length > 0 ? (
              <div className="flex flex-col gap-2">
                {recentNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/workspaces/${workspaceId}/notes/${note.id}`}
                    className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border)] p-3 transition hover:border-[var(--color-secondary)] hover:bg-[var(--color-surface-low)]"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-mid)]">
                      {note.type === "WHITEBOARD" ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                          <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-secondary)]">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--color-text)]">{note.title}</p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
                        {note.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-subtle)]">No shared notes yet.</p>
            )}
          </section>

          {/* Pinned Files */}
          <section className="border-b border-[var(--color-border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Pinned Files
              </p>
              <Link href={`/workspaces/${workspaceId}/files`} className="font-mono text-xs text-[var(--color-secondary)] hover:underline">
                View all
              </Link>
            </div>
            {pinnedFiles.length > 0 ? (
              <div className="flex flex-col gap-2">
                {pinnedFiles.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/files/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] p-3 transition hover:border-[var(--color-secondary)] hover:bg-[var(--color-surface-low)]"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-secondary)]">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--color-text)]">{file.name}</p>
                      {file.sizeBytes ? (
                        <p className="mt-0.5 font-mono text-xs text-[var(--color-subtle)]">
                          {formatFileSize(file.sizeBytes)}
                        </p>
                      ) : null}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-subtle)]">
                No pinned files. Owners and admins can pin files from the Files page.
              </p>
            )}
          </section>

          {/* All channels */}
          <section className="border-b border-[var(--color-border)] p-4">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              All Channels
            </p>
            <div className="flex flex-col gap-1">
              {allChannels.map((c) => {
                const cName = c.type === "ANNOUNCEMENT"
                  ? "Announcements"
                  : c.meetingId
                    ? (c.meeting?.title ?? c.name)
                    : `#${c.name}`;
                const isActive = c.id === channelId;
                return (
                  <Link
                    key={c.id}
                    href={`/workspaces/${workspaceId}/chat/${c.id}`}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${
                      isActive
                        ? "bg-[var(--color-secondary)] font-medium text-white"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"
                    }`}
                  >
                    {c.type === "ANNOUNCEMENT" ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                    ) : c.meetingId ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    ) : (
                      <span className="shrink-0 font-mono opacity-60">#</span>
                    )}
                    <span className="truncate">{cName}</span>
                    {c.meetingId && c.meeting?.startsAt ? (
                      <span className="ml-auto shrink-0 font-mono opacity-50">
                        {new Date(c.meeting.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Members */}
          <section className="p-4">
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Members — {members.length}
            </p>
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <div key={m.user.id} className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-bold text-white">
                    {m.user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-[var(--color-text)]">{m.user.displayName}</p>
                  </div>
                  {m.role !== "MEMBER" ? (
                    <span className="shrink-0 font-mono text-xs text-[var(--color-subtle)]">
                      {m.role.toLowerCase()}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* Create channel (OWNER/ADMIN only, workspace channels only) */}
          {canManage && !isMeetingChannel ? (
            <section className="mt-auto border-t border-[var(--color-border)] p-4">
              <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Add Channel
              </p>
              <form action={createChannel} className="flex gap-2">
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input
                  name="name"
                  required
                  placeholder="channel-name"
                  className="min-h-9 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 font-mono text-xs outline-none transition focus:border-[var(--color-secondary)]"
                />
                <PendingSubmitButton
                  pendingLabel="..."
                  className="rounded-full bg-[var(--color-secondary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-60"
                >
                  Create
                </PendingSubmitButton>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${i === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[i]}`;
}
