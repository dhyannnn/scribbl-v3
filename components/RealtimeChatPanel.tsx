"use client";

import Link from "next/link";
import { useBroadcastEvent, useEventListener } from "@liveblocks/react/suspense";
import { FormEvent, useMemo, useState, useTransition } from "react";
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
  };
  isPending?: boolean;
};

export type RealtimeChatChannel = {
  id: string;
  name: string;
  messages: RealtimeChatMessage[];
} | null;

type RealtimeChatPanelProps = {
  workspaceId: string;
  roomId: string;
  channel: RealtimeChatChannel;
  currentUserId: string;
  currentUserDisplayName: string;
  canModerateChat: boolean;
  status?: string;
  title: string;
  emptyText: string;
  placeholder: string;
  openInChannelsHref?: string;
  maxMessagesHeightClassName?: string;
};

const maxMessageLength = 2000;

type ChatEvent =
  | { type: "message-created"; message: RealtimeChatMessage }
  | { type: "message-updated"; message: RealtimeChatMessage }
  | { type: "message-deleted"; message: RealtimeChatMessage };

export function RealtimeChatPanel({ roomId, ...props }: RealtimeChatPanelProps) {
  if (!props.channel) {
    return <EmptyChatPanel title={props.title} openInChannelsHref={props.openInChannelsHref} />;
  }

  return (
    <LiveblocksRoom key={roomId} roomId={roomId}>
      <RealtimeChatPanelContent {...props} />
    </LiveblocksRoom>
  );
}

function EmptyChatPanel({
  title,
  openInChannelsHref,
}: {
  title: string;
  openInChannelsHref?: string;
}) {
  return (
    <section id="meeting-chat" className="scroll-mt-6 rounded-md border border-[#d8d8ce] bg-white shadow-sm">
      <header className="border-b border-[#e6e6dc] px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="max-w-full truncate text-sm font-medium text-[#2f604b]">{title}</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          {openInChannelsHref ? (
            <Link href={openInChannelsHref} className="text-sm font-medium text-[#2f604b]">
              Open in channels
            </Link>
          ) : null}
        </div>
      </header>
      <div className="p-5">
        <div className="rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] px-4 py-3 text-sm text-[#66685f]">
          Create a channel before sending messages.
        </div>
      </div>
    </section>
  );
}

function RealtimeChatPanelContent({
  workspaceId,
  channel,
  currentUserId,
  currentUserDisplayName,
  canModerateChat,
  status,
  title,
  emptyText,
  placeholder,
  openInChannelsHref,
  maxMessagesHeightClassName = "max-h-[460px]",
}: Omit<RealtimeChatPanelProps, "roomId">) {
  const [messages, setMessages] = useState(channel?.messages ?? []);
  const [sendStatus, setSendStatus] = useState<string | null>(status ?? null);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [isPending, startTransition] = useTransition();
  const broadcast = useBroadcastEvent();
  const statusMessage = useMemo(() => getChatStatusMessage(sendStatus), [sendStatus]);

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
      id: `pending-${Date.now()}`,
      channelId: channel.id,
      senderUserId: currentUserId,
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      sender: {
        displayName: currentUserDisplayName,
      },
      isPending: true,
    };

    setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
    setSendStatus(null);
    form.reset();

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

  return (
    <section id="meeting-chat" className="scroll-mt-6 rounded-md border border-[#d8d8ce] bg-white shadow-sm">
      <header className="border-b border-[#e6e6dc] px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="max-w-full truncate text-sm font-medium text-[#2f604b]" title={channel?.name ?? title}>
              {channel?.name ?? title}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          {openInChannelsHref ? (
            <Link href={openInChannelsHref} className="text-sm font-medium text-[#2f604b]">
              Open in channels
            </Link>
          ) : null}
        </div>
        {statusMessage ? (
          <p className="mt-3 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] px-3 py-2 text-sm text-[#4d4f47]">
            {statusMessage}
          </p>
        ) : null}
      </header>

      <div className={`grid gap-4 overflow-y-auto p-5 ${maxMessagesHeightClassName}`}>
        {messages.map((message) => {
          const isOwnMessage = message.senderUserId === currentUserId;
          const canEditMessage = isOwnMessage && !message.deletedAt && !message.isPending;
          const canDeleteMessage = !message.deletedAt && !message.isPending && (isOwnMessage || canModerateChat);

          return (
            <article key={message.id} className={`rounded-md bg-[#fbfbf8] p-4 ${message.isPending ? "opacity-70" : ""}`}>
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold">{message.sender.displayName}</p>
                <p className="text-xs text-[#777970]">
                  {formatMessageTime(message.createdAt)}
                  {message.editedAt && !message.deletedAt ? " / edited" : ""}
                  {message.isPending ? " / sending" : ""}
                </p>
              </div>
              {message.deletedAt ? (
                <p className="mt-2 text-sm italic leading-6 text-[#777970]">Message deleted.</p>
              ) : editingMessageId === message.id ? (
                <form onSubmit={(event) => editChatMessage(event, message.id)} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <input
                    name="body"
                    required
                    maxLength={maxMessageLength}
                    defaultValue={message.body}
                    className="min-h-10 min-w-0 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                  />
                  <button
                    disabled={isPending}
                    className="min-h-10 rounded-md border border-[#2f604b] bg-white px-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMessageId("")}
                    className="min-h-10 rounded-md border border-[#c8c8bd] px-3 text-sm font-medium text-[#4d4f47] transition hover:bg-white"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#4d4f47]">{message.body}</p>
              )}
              {editingMessageId !== message.id && (canEditMessage || canDeleteMessage) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEditMessage ? (
                    <button
                      type="button"
                      onClick={() => setEditingMessageId(message.id)}
                      className="rounded-md border border-[#c8c8bd] px-3 py-1.5 text-xs font-medium text-[#2f604b] transition hover:border-[#2f604b] hover:bg-[#eef5ef]"
                    >
                      Edit
                    </button>
                  ) : null}
                  {canDeleteMessage ? (
                    <button
                      type="button"
                      onClick={() => deleteChatMessage(message.id)}
                      disabled={isPending}
                      className="rounded-md border border-[#c8c8bd] px-3 py-1.5 text-xs font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? "Working..." : "Delete"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {channel && messages.length === 0 ? (
          <p className="rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-4 text-sm text-[#66685f]">
            {emptyText}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-[#e6e6dc] p-5">
        {channel ? (
          <form onSubmit={sendChatMessage} className="flex flex-col gap-3 sm:flex-row">
            <input
              name="body"
              type="text"
              required
              maxLength={maxMessageLength}
              placeholder={placeholder}
              className="min-h-11 flex-1 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-4 text-sm text-[#20201d] outline-none transition focus:border-[#2f604b] focus:bg-white"
            />
            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Sending..." : "Send"}
            </button>
          </form>
        ) : (
          <div className="rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] px-4 py-3 text-sm text-[#66685f]">
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

function applyMessageEvent(messages: RealtimeChatMessage[], event: ChatEvent) {
  if (event.type === "message-created") {
    return messages.some((message) => message.id === event.message.id) ? messages : [...messages, event.message];
  }

  return messages.map((message) => (message.id === event.message.id ? event.message : message));
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
