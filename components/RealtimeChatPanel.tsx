"use client";

import Link from "next/link";
import { useBroadcastEvent, useEventListener, useMyPresence, useOthers } from "@liveblocks/react/suspense";
import { Check, Edit2, SendHorizontal, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";

export type RealtimeChatMessage = {
  id: string;
  channelId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: {
    displayName: string;
    avatarUrl: string | null;
  };
  isPending?: boolean;
};

export type RealtimeChatChannel = {
  id: string;
  name: string;
  type?: "CHAT" | "ANNOUNCEMENT";
  messages: RealtimeChatMessage[];
} | null;

type RealtimeChatPanelProps = {
  workspaceId: string;
  roomId: string;
  channel: RealtimeChatChannel;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  canModerateChat: boolean;
  status?: string;
  title: string;
  emptyText: string;
  placeholder: string;
  canPostMessages?: boolean;
  readOnlyText?: string;
  openInChannelsHref?: string;
  maxMessagesHeightClassName?: string;
  lazy?: boolean;
  /** fullscreen: fills parent, no border/shadow. card: rounded card (default, for meeting hub) */
  variant?: "fullscreen" | "card";
};

const maxMessageLength = 2000;

type ChatEvent =
  | { type: "message-created"; message: RealtimeChatMessage }
  | { type: "message-updated"; message: RealtimeChatMessage }
  | { type: "message-deleted"; message: RealtimeChatMessage };

type MessageWithGroup = RealtimeChatMessage & {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showAvatar: boolean;
};

export function RealtimeChatPanel({ roomId, lazy = false, variant = "card", ...props }: RealtimeChatPanelProps) {
  if (!props.channel) {
    return <EmptyChatPanel title={props.title} openInChannelsHref={props.openInChannelsHref} variant={variant} />;
  }

  return (
    <LiveblocksRoom key={roomId} roomId={roomId} lazy={lazy} fallback={<ChatConnectingPanel title={props.title} openInChannelsHref={props.openInChannelsHref} variant={variant} />}>
      <RealtimeChatPanelContent {...props} variant={variant} />
    </LiveblocksRoom>
  );
}

function EmptyChatPanel({
  title,
  openInChannelsHref,
  variant = "card",
}: {
  title: string;
  openInChannelsHref?: string;
  variant?: "fullscreen" | "card";
}) {
  return (
    <section id="meeting-chat" className={sectionClass(variant)}>
      <PanelHeader title={title} openInChannelsHref={openInChannelsHref} />
      <div className="p-4 sm:p-5">
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
          Create a channel before sending messages.
        </div>
      </div>
    </section>
  );
}

function ChatConnectingPanel({
  title,
  openInChannelsHref,
  variant = "card",
}: {
  title: string;
  openInChannelsHref?: string;
  variant?: "fullscreen" | "card";
}) {
  return (
    <section id="meeting-chat" className={sectionClass(variant)}>
      <PanelHeader title={title} openInChannelsHref={openInChannelsHref} />
      <div className="p-4 sm:p-5">
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
          Connecting chat...
        </div>
      </div>
    </section>
  );
}

function sectionClass(variant: "fullscreen" | "card") {
  return variant === "fullscreen"
    ? "flex min-h-0 min-w-0 w-full flex-1 flex-col bg-[var(--color-surface)]"
    : "min-w-0 scroll-mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm";
}

function PanelHeader({ title, openInChannelsHref }: { title: string; openInChannelsHref?: string }) {
  return (
    <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="max-w-full truncate text-sm font-medium text-[var(--color-secondary)]">{title}</p>
          <h2 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{title}</h2>
        </div>
        {openInChannelsHref ? (
          <Link href={openInChannelsHref} className="text-sm font-medium text-[var(--color-secondary)]">
            Open in channels
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function RealtimeChatPanelContent({
  workspaceId,
  channel,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatarUrl,
  canModerateChat,
  status,
  title,
  emptyText,
  placeholder,
  canPostMessages = true,
  readOnlyText = "You can read this channel, but you cannot post here.",
  openInChannelsHref,
  maxMessagesHeightClassName = "max-h-[50vh] sm:max-h-[460px]",
  variant = "card",
}: Omit<RealtimeChatPanelProps, "roomId">) {
  const [messages, setMessages] = useState(channel?.messages ?? []);
  const [sendStatus, setSendStatus] = useState<string | null>(status ?? null);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [isPending, startTransition] = useTransition();
  const broadcast = useBroadcastEvent();
  const [, updateMyPresence] = useMyPresence();
  const others = useOthers();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pendingMessageCounterRef = useRef(0);
  const statusMessage = useMemo(() => getChatStatusMessage(sendStatus), [sendStatus]);
  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);
  const typingUsers = useMemo(
    () =>
      others
        .filter((other) => Boolean((other.presence as { typing?: boolean } | null)?.typing))
        .map((other) => getUserInfoName(other.info as { name?: string; email?: string } | undefined)),
    [others],
  );

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateMyPresence({ typing: false });
    };
  }, [updateMyPresence]);

  useEventListener(({ event }) => {
    const chatEvent = event as ChatEvent;

    if (!channel || chatEvent.message.channelId !== channel.id) {
      return;
    }

    setMessages((currentMessages) => applyMessageEvent(currentMessages, chatEvent));
  });

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!channel) {
      return;
    }

    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();

    if (!body) {
      setSendStatus("invalid");
      return;
    }

    if (body.length > maxMessageLength) {
      setSendStatus("too-long");
      return;
    }

    const optimisticMessage: RealtimeChatMessage = {
      id: `pending-${currentUserId}-${pendingMessageCounterRef.current++}`,
      channelId: channel.id,
      senderUserId: currentUserId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      sender: {
        displayName: currentUserDisplayName,
        avatarUrl: currentUserAvatarUrl,
      },
      isPending: true,
    };

    setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
    setSendStatus(null);
    form.reset();
    resetTextarea(inputRef.current);
    setTyping(false);

    startTransition(async () => {
      const savedMessage = await writeMessage("POST", { workspaceId, channelId: channel.id, body });

      if (!savedMessage) {
        setMessages((currentMessages) => currentMessages.filter((message) => message.id !== optimisticMessage.id));
        setSendStatus("send-failed");
        return;
      }

      setMessages((currentMessages) =>
        currentMessages.map((message) => (message.id === optimisticMessage.id ? savedMessage : message)),
      );
      broadcast({ type: "message-created", message: savedMessage } satisfies ChatEvent);
    });
  }

  function editChatMessage(event: FormEvent<HTMLFormElement>, messageId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();

    if (!body) {
      setSendStatus("invalid");
      return;
    }

    if (body.length > maxMessageLength) {
      setSendStatus("too-long");
      return;
    }

    startTransition(async () => {
      const updatedMessage = await writeMessage("PATCH", { workspaceId, messageId, body });

      if (!updatedMessage) {
        setSendStatus("update-failed");
        return;
      }

      setMessages((currentMessages) => applyMessageEvent(currentMessages, { type: "message-updated", message: updatedMessage }));
      broadcast({ type: "message-updated", message: updatedMessage } satisfies ChatEvent);
      setEditingMessageId("");
      setSendStatus(null);
    });
  }

  function deleteChatMessage(messageId: string) {
    startTransition(async () => {
      const deletedMessage = await writeMessage("DELETE", { workspaceId, messageId });

      if (!deletedMessage) {
        setSendStatus("delete-failed");
        return;
      }

      setMessages((currentMessages) => applyMessageEvent(currentMessages, { type: "message-deleted", message: deletedMessage }));
      broadcast({ type: "message-deleted", message: deletedMessage } satisfies ChatEvent);
      setSendStatus(null);
    });
  }

  function handleInputChange(event: FormEvent<HTMLTextAreaElement>) {
    autoGrowTextarea(event.currentTarget);
    setTyping(true);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function setTyping(isTyping: boolean) {
    updateMyPresence({ typing: isTyping });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        updateMyPresence({ typing: false });
      }, 2000);
    }
  }

  const messagesClass = variant === "fullscreen"
    ? "flex-1 grid gap-2 overflow-y-auto bg-[var(--color-bg)] p-3 sm:p-5 content-start"
    : `grid gap-2 overflow-y-auto bg-[var(--color-bg)] p-3 sm:p-5 ${maxMessagesHeightClassName}`;

  return (
    <section id="meeting-chat" className={sectionClass(variant)}>
      {variant === "card" ? (
        <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="max-w-full truncate text-sm font-medium text-[var(--color-secondary)]" title={channel?.name ?? title}>
                {channel?.name ?? title}
              </p>
              <h2 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{title}</h2>
            </div>
            {openInChannelsHref ? (
              <Link href={openInChannelsHref} className="text-sm font-medium text-[var(--color-secondary)]">
                Open in channels
              </Link>
            ) : null}
          </div>
          {statusMessage ? (
            <p className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm text-[var(--color-muted)]">
              {statusMessage}
            </p>
          ) : null}
        </header>
      ) : statusMessage ? (
        <div className="border-b border-[var(--color-border)] px-5 py-2">
          <p className="text-sm text-[var(--color-muted)]">{statusMessage}</p>
        </div>
      ) : null}

      <div ref={messagesContainerRef} className={messagesClass}>
        {groupedMessages.map((message) => {
          const isOwnMessage = message.senderUserId === currentUserId;
          const canEditMessage = isOwnMessage && !message.deletedAt && !message.isPending;
          const canDeleteMessage = !message.deletedAt && !message.isPending && (isOwnMessage || canModerateChat);

          return (
            <article
              key={message.id}
              className={`flex min-w-0 items-start gap-2.5 ${isOwnMessage ? "flex-row-reverse" : "flex-row"} ${message.isFirstInGroup && !isOwnMessage ? "mt-3" : "mt-0.5"}`}
            >
              {!isOwnMessage ? (
                <div className="mt-0.5 shrink-0">
                  <Avatar name={message.sender.displayName} avatarUrl={message.sender.avatarUrl} size={28} />
                </div>
              ) : null}

              <div className={`flex max-w-[80%] flex-col gap-0.5 sm:max-w-[70%] ${isOwnMessage ? "items-end" : "items-start"}`}>
                {!isOwnMessage && message.isFirstInGroup ? (
                  <span className="max-w-full truncate px-1 text-xs font-semibold text-[var(--color-muted)]">{message.sender.displayName}</span>
                ) : null}

                {editingMessageId === message.id && !message.deletedAt ? (
                  <form
                    onSubmit={(event) => editChatMessage(event, message.id)}
                    className="grid w-[min(100%,360px)] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                  >
                    <textarea
                      name="body"
                      required
                      maxLength={maxMessageLength}
                      defaultValue={message.body}
                      rows={2}
                      onInput={(event) => autoGrowTextarea(event.currentTarget)}
                      className="max-h-40 min-h-16 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingMessageId("")}
                        className="grid size-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
                        aria-label="Cancel edit"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                      <button
                        disabled={isPending}
                        className="grid size-9 place-items-center rounded-full bg-[var(--color-secondary)] text-white transition hover:bg-[var(--color-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Save edit"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    className={`max-w-full whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed sm:px-4 ${
                      isOwnMessage
                        ? "rounded-br-sm bg-[var(--color-secondary)] text-white"
                        : "rounded-bl-sm bg-[var(--color-surface-high)] text-[var(--color-text)]"
                    } ${message.isPending ? "opacity-60" : ""}`}
                  >
                    {message.deletedAt ? <span className="italic opacity-60">Message deleted</span> : message.body}
                  </div>
                )}

                {message.isLastInGroup ? (
                  <span className={`px-3 text-[10px] text-[var(--color-subtle)] ${isOwnMessage ? "text-right" : ""}`}>
                    {formatMessageTime(message.createdAt)}
                    {message.editedAt && !message.deletedAt ? " · edited" : ""}
                    {message.isPending ? " · sending" : ""}
                  </span>
                ) : null}

                {editingMessageId !== message.id && (canEditMessage || canDeleteMessage) ? (
                  <div className={`flex gap-1 px-2 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                    {canEditMessage ? (
                      <button
                        type="button"
                        onClick={() => setEditingMessageId(message.id)}
                        className="grid size-7 place-items-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-secondary)]"
                        aria-label="Edit message"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                    ) : null}
                    {canDeleteMessage ? (
                      <button
                        type="button"
                        onClick={() => deleteChatMessage(message.id)}
                        disabled={isPending}
                        className="grid size-7 place-items-center rounded-full text-[var(--color-danger)] transition hover:bg-[var(--color-danger-dim)] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Delete message"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
        {channel && messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] p-4 text-sm text-[var(--color-muted)]">
            {emptyText}
          </p>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
        {typingUsers.length > 0 ? (
          <div className="mb-3 flex items-center gap-2 px-1 text-xs text-[var(--color-subtle)]">
            <ThreeDotsAnimation />
            <span className="min-w-0 truncate">{formatTypingUsers(typingUsers)}</span>
          </div>
        ) : null}
        {channel && canPostMessages ? (
          <form onSubmit={sendChatMessage} className="flex min-w-0 items-end gap-2">
            <textarea
              ref={inputRef}
              name="body"
              required
              maxLength={maxMessageLength}
              placeholder={placeholder}
              rows={1}
              onInput={handleInputChange}
              onKeyDown={handleComposerKeyDown}
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm leading-5 text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)] focus:ring-2 focus:ring-[var(--color-secondary)]/10"
            />
            <button
              type="submit"
              disabled={isPending}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-secondary)] text-white transition hover:bg-[var(--color-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send message"
              title="Send"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
        ) : channel ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
            {readOnlyText}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
            Create a channel before sending messages.
          </div>
        )}
      </footer>
    </section>
  );
}

async function writeMessage(method: "POST" | "PATCH" | "DELETE", body: object) {
  try {
    const response = await fetch("/api/chat/messages", {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();

    if (!response.ok || !payload?.message) {
      return null;
    }

    return payload.message as RealtimeChatMessage;
  } catch {
    return null;
  }
}

function groupMessages(messages: RealtimeChatMessage[]): MessageWithGroup[] {
  return messages.map((message, index) => {
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const prevTimeBreak = prev
      ? new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000
      : true;
    const nextTimeBreak = next
      ? new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() > 5 * 60 * 1000
      : true;
    const sameSenderAsPrev = prev?.senderUserId === message.senderUserId && !prev.deletedAt && !message.deletedAt;
    const sameSenderAsNext = next?.senderUserId === message.senderUserId && !next.deletedAt && !message.deletedAt;
    const isFirstInGroup = !sameSenderAsPrev || prevTimeBreak;
    const isLastInGroup = !sameSenderAsNext || nextTimeBreak;

    return {
      ...message,
      isFirstInGroup,
      isLastInGroup,
      showAvatar: true,
    };
  });
}

function applyMessageEvent(messages: RealtimeChatMessage[], event: ChatEvent) {
  if (event.type === "message-created") {
    return messages.some((message) => message.id === event.message.id) ? messages : [...messages, event.message];
  }

  return messages.map((message) => (message.id === event.message.id ? event.message : message));
}

function Avatar({
  name,
  avatarUrl,
  size = 32,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = getInitials(name);

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Avatar URLs are user-uploaded Supabase public URLs, not static app assets.
      <img
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const colors = ["#085ac0", "#2170e4", "#004395", "#0041a8"];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ width: size, height: size, background: color }}
    >
      {initials}
    </div>
  );
}

function ThreeDotsAnimation() {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="inline-block size-1.5 rounded-full bg-[#8a8c82]"
          style={{ animation: `chat-typing-dot 1.2s infinite ${index * 0.2}s` }}
        />
      ))}
    </span>
  );
}

function autoGrowTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function resetTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTypingUsers(names: string[]) {
  if (names.length === 1) {
    return `${names[0]} is typing`;
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are typing`;
  }

  return "Several people are typing";
}

function getUserInfoName(info: { name?: string; email?: string } | undefined) {
  return info?.name || info?.email || "Someone";
}

function getInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "?";
}

function getChatStatusMessage(status?: string | null) {
  switch (status) {
    case "sent":
      return "Message sent.";
    case "updated":
      return "Message updated.";
    case "deleted":
      return "Message deleted.";
    case "invalid":
      return "Write a message before sending.";
    case "too-long":
      return "Messages must be 2,000 characters or fewer.";
    case "unauthorized":
      return "You do not have permission to send messages in this workspace.";
    case "send-failed":
      return "Message could not be sent. Please try again.";
    case "update-failed":
      return "Message could not be updated. Please try again.";
    case "delete-failed":
      return "Message could not be deleted. Please try again.";
    default:
      return null;
  }
}
