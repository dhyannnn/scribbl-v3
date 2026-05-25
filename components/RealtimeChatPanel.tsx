"use client";

import "katex/dist/katex.min.css";
import Link from "next/link";
import katex from "katex";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import { useBroadcastEvent, useEventListener, useMyPresence, useOthers } from "@liveblocks/react/suspense";
import { Check, Edit2, ExternalLink, Hash, Paperclip, Pin, PinOff, Reply, Search, SendHorizontal, Smile, Trash2, X } from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);

// ── Types ────────────────────────────────────────────────────────────────────

export type RealtimeChatMessage = {
  id: string;
  channelId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  isPinned: boolean;
  replyToId: string | null;
  replyTo: { id: string; body: string; sender: { displayName: string } } | null;
  reactions: { emoji: string; userIds: string[] }[];
  attachmentFile: { id: string; name: string; mimeType: string; sizeBytes: number | null; publicUrl: string | null } | null;
  sender: { displayName: string; avatarUrl: string | null };
  isPending?: boolean;
};

export type RealtimeChatChannel = {
  id: string;
  name: string;
  type?: "CHAT" | "ANNOUNCEMENT" | "DIRECT";
  messages: RealtimeChatMessage[];
} | null;

type Member = { id: string; displayName: string; avatarUrl: string | null };

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
  variant?: "fullscreen" | "card";
  members?: Member[];
};

const maxMessageLength = 2000;

type ChatEvent =
  | { type: "message-created"; message: RealtimeChatMessage }
  | { type: "message-updated"; message: RealtimeChatMessage }
  | { type: "message-deleted"; message: RealtimeChatMessage }
  | { type: "reaction-toggled"; messageId: string; emoji: string; userId: string; action: "added" | "removed" }
  | { type: "message-pinned"; message: RealtimeChatMessage };

type MessageWithGroup = RealtimeChatMessage & {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

const COMMON_EMOJIS = ["👍","❤️","😂","😮","😢","🔥","👏","🎉","🤔","👀","✅","💯"];

// ── Shell ────────────────────────────────────────────────────────────────────

export function RealtimeChatPanel({ roomId, lazy = false, variant = "card", ...props }: RealtimeChatPanelProps) {
  if (!props.channel) {
    return <EmptyChatPanel title={props.title} openInChannelsHref={props.openInChannelsHref} variant={variant} />;
  }
  return (
    <LiveblocksRoom key={roomId} roomId={roomId} lazy={lazy}
      fallback={<ChatConnectingPanel title={props.title} openInChannelsHref={props.openInChannelsHref} variant={variant} />}>
      <RealtimeChatPanelContent {...props} variant={variant} />
    </LiveblocksRoom>
  );
}

// ── Fallback panels ──────────────────────────────────────────────────────────

function EmptyChatPanel({ title, openInChannelsHref, variant = "card" }: { title: string; openInChannelsHref?: string; variant?: "fullscreen" | "card" }) {
  return (
    <section className={sectionClass(variant)}>
      <PanelHeader title={title} openInChannelsHref={openInChannelsHref} />
      <div className="p-4">
        <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
          Create a channel before sending messages.
        </p>
      </div>
    </section>
  );
}

function ChatConnectingPanel({ title, openInChannelsHref, variant = "card" }: { title: string; openInChannelsHref?: string; variant?: "fullscreen" | "card" }) {
  return (
    <section className={sectionClass(variant)}>
      <PanelHeader title={title} openInChannelsHref={openInChannelsHref} />
      <div className="flex items-center gap-2 p-5 text-sm text-[var(--color-muted)]">
        <ThreeDotsAnimation />
        <span>Connecting…</span>
      </div>
    </section>
  );
}

// ── Main content ─────────────────────────────────────────────────────────────

function RealtimeChatPanelContent({
  workspaceId, channel, currentUserId, currentUserDisplayName, currentUserAvatarUrl,
  canModerateChat, status, title, emptyText, placeholder,
  canPostMessages = true,
  readOnlyText = "You can read this channel, but you cannot post here.",
  openInChannelsHref, maxMessagesHeightClassName = "max-h-[50vh] sm:max-h-[460px]",
  variant = "card", members = [],
}: Omit<RealtimeChatPanelProps, "roomId">) {
  const [messages, setMessages] = useState<RealtimeChatMessage[]>(channel?.messages ?? []);
  const [sendStatus, setSendStatus] = useState<string | null>(status ?? null);
  const [editingMessageId, setEditingMessageId] = useState("");
  const [replyingTo, setReplyingTo] = useState<RealtimeChatMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [emojiPickerForId, setEmojiPickerForId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [, startTransition] = useTransition();
  const broadcast = useBroadcastEvent();
  const [, updateMyPresence] = useMyPresence();
  const others = useOthers();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pendingCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const typingUsers = useMemo(
    () => others
      .filter((o) => Boolean((o.presence as { typing?: boolean } | null)?.typing))
      .map((o) => getUserInfoName(o.info as { name?: string; email?: string } | undefined)),
    [others],
  );

  const pinnedMessages = useMemo(() => messages.filter((m) => m.isPinned && !m.deletedAt), [messages]);

  const displayMessages = useMemo(() => {
    let list = messages;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.body.toLowerCase().includes(q) || m.sender.displayName.toLowerCase().includes(q));
    }
    return groupMessages(list);
  }, [messages, searchQuery]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!searchQuery) {
      const el = messagesContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, searchQuery]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerForId) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-emoji-picker]")) {
        setEmojiPickerForId(null);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiPickerForId]);

  useEffect(() => {
    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); updateMyPresence({ typing: false }); };
  }, [updateMyPresence]);

  useEventListener(({ event }) => {
    const ev = event as ChatEvent;
    if (!channel) return;

    if ("message" in ev && ev.message.channelId !== channel.id) return;
    if (ev.type === "message-created") {
      setMessages((cur) => cur.some((m) => m.id === ev.message.id) ? cur : [...cur, ev.message]);
    } else if (ev.type === "message-updated" || ev.type === "message-deleted" || ev.type === "message-pinned") {
      setMessages((cur) => cur.map((m) => m.id === ev.message.id ? ev.message : m));
    } else if (ev.type === "reaction-toggled") {
      setMessages((cur) => cur.map((m) => {
        if (m.id !== ev.messageId) return m;
        const reactions = [...m.reactions];
        const idx = reactions.findIndex((r) => r.emoji === ev.emoji);
        if (ev.action === "added") {
          if (idx >= 0) reactions[idx] = { ...reactions[idx], userIds: [...reactions[idx].userIds, ev.userId] };
          else reactions.push({ emoji: ev.emoji, userIds: [ev.userId] });
        } else {
          if (idx >= 0) {
            const filtered = reactions[idx].userIds.filter((id) => id !== ev.userId);
            if (filtered.length === 0) reactions.splice(idx, 1);
            else reactions[idx] = { ...reactions[idx], userIds: filtered };
          }
        }
        return { ...m, reactions };
      }));
    }
  });

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!channel) return;
    const form = e.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) { setSendStatus("invalid"); return; }
    if (body.length > maxMessageLength) { setSendStatus("too-long"); return; }

    const optimistic: RealtimeChatMessage = {
      id: `pending-${currentUserId}-${pendingCounterRef.current++}`,
      channelId: channel.id, senderUserId: currentUserId, body,
      createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      isPinned: false, replyToId: replyingTo?.id ?? null, replyTo: replyingTo ? {
        id: replyingTo.id, body: replyingTo.body, sender: { displayName: replyingTo.sender.displayName },
      } : null,
      reactions: [], attachmentFile: null,
      sender: { displayName: currentUserDisplayName, avatarUrl: currentUserAvatarUrl },
      isPending: true,
    };

    setMessages((cur) => [...cur, optimistic]);
    setSendStatus(null);
    form.reset();
    resetTextarea(inputRef.current);
    setTyping(false);
    setReplyingTo(null);
    const replyToId = optimistic.replyToId;

    startTransition(async () => {
      const saved = await writeMessage("POST", { workspaceId, channelId: channel.id, body, ...(replyToId ? { replyToId } : {}) });
      if (!saved) {
        setMessages((cur) => cur.filter((m) => m.id !== optimistic.id));
        setSendStatus("send-failed"); return;
      }
      setMessages((cur) => cur.map((m) => m.id === optimistic.id ? saved : m));
      broadcast({ type: "message-created", message: saved } satisfies ChatEvent);
    });
  }

  function editMessage(e: React.FormEvent<HTMLFormElement>, messageId: string) {
    e.preventDefault();
    const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
    if (!body || body.length > maxMessageLength) { setSendStatus("invalid"); return; }
    startTransition(async () => {
      const updated = await writeMessage("PATCH", { workspaceId, messageId, body });
      if (!updated) { setSendStatus("update-failed"); return; }
      setMessages((cur) => cur.map((m) => m.id === messageId ? updated : m));
      broadcast({ type: "message-updated", message: updated } satisfies ChatEvent);
      setEditingMessageId("");
    });
  }

  function deleteMessage(messageId: string) {
    startTransition(async () => {
      const deleted = await writeMessage("DELETE", { workspaceId, messageId });
      if (!deleted) { setSendStatus("delete-failed"); return; }
      setMessages((cur) => cur.map((m) => m.id === messageId ? deleted : m));
      broadcast({ type: "message-deleted", message: deleted } satisfies ChatEvent);
    });
  }

  function toggleReaction(messageId: string, emoji: string) {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    const existing = message.reactions.find((r) => r.emoji === emoji);
    const hasReacted = existing?.userIds.includes(currentUserId) ?? false;
    const action = hasReacted ? "removed" : "added";

    // Optimistic update
    setMessages((cur) => cur.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = [...m.reactions];
      const idx = reactions.findIndex((r) => r.emoji === emoji);
      if (action === "added") {
        if (idx >= 0) reactions[idx] = { ...reactions[idx], userIds: [...reactions[idx].userIds, currentUserId] };
        else reactions.push({ emoji, userIds: [currentUserId] });
      } else {
        if (idx >= 0) {
          const filtered = reactions[idx].userIds.filter((id) => id !== currentUserId);
          if (filtered.length === 0) reactions.splice(idx, 1);
          else reactions[idx] = { ...reactions[idx], userIds: filtered };
        }
      }
      return { ...m, reactions };
    }));
    setEmojiPickerForId(null);

    startTransition(async () => {
      await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      broadcast({ type: "reaction-toggled", messageId, emoji, userId: currentUserId, action } satisfies ChatEvent);
    });
  }

  function togglePin(message: RealtimeChatMessage) {
    const nextPinned = !message.isPinned;
    startTransition(async () => {
      const updated = await writeMessage("PATCH", { workspaceId, messageId: message.id, pin: nextPinned });
      if (!updated) return;
      setMessages((cur) => cur.map((m) => m.id === message.id ? updated : m));
      broadcast({ type: "message-pinned", message: updated } satisfies ChatEvent);
    });
  }

  async function handleAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !channel) return;
    setAttachmentPending(true);
    try {
      const fd = new FormData();
      fd.append("workspaceId", workspaceId);
      fd.append("file", file);
      const res = await fetch("/api/chat/attachments", { method: "POST", body: fd });
      if (!res.ok) { setSendStatus("attachment-failed"); return; }
      const { file: uploaded } = await res.json() as { file: RealtimeChatMessage["attachmentFile"] };
      if (!uploaded) return;

      // Send message with attachment
      const body = file.name;
      const saved = await writeMessage("POST", { workspaceId, channelId: channel.id, body, attachmentFileId: uploaded.id });
      if (saved) {
        setMessages((cur) => [...cur, saved]);
        broadcast({ type: "message-created", message: saved } satisfies ChatEvent);
      }
    } finally {
      setAttachmentPending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleInputChange(e: React.FormEvent<HTMLTextAreaElement>) {
    autoGrowTextarea(e.currentTarget);
    setTyping(true);
    // @mention detection
    const val = e.currentTarget.value;
    const cursor = e.currentTarget.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = /@(\w*)$/.exec(before);
    setMentionQuery(atMatch ? atMatch[1] : null);
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && mentionMembers.length > 0) {
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  function insertMention(member: Member) {
    const textarea = inputRef.current;
    if (!textarea) return;
    const val = textarea.value;
    const cursor = textarea.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const replaced = before.replace(/@(\w*)$/, `@${member.displayName} `);
    textarea.value = replaced + val.slice(cursor);
    setMentionQuery(null);
    textarea.focus();
    textarea.setSelectionRange(replaced.length, replaced.length);
  }

  function setTyping(isTyping: boolean) {
    updateMyPresence({ typing: isTyping });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) typingTimeoutRef.current = setTimeout(() => updateMyPresence({ typing: false }), 2000);
  }

  const mentionMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.id !== currentUserId && m.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members, currentUserId]);

  const statusMessage = useMemo(() => getChatStatusMessage(sendStatus), [sendStatus]);

  const messagesClass = variant === "fullscreen"
    ? "flex-1 overflow-y-auto bg-[var(--color-bg)] p-3 sm:p-5 content-start"
    : `overflow-y-auto bg-[var(--color-bg)] p-3 sm:p-5 ${maxMessagesHeightClassName}`;

  return (
    <section className={sectionClass(variant)}>
      {/* Header */}
      {variant === "card" ? (
        <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--color-secondary)]">{channel?.name ?? title}</p>
              <h2 className="mt-0.5 break-words text-xl font-semibold">{title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {pinnedMessages.length > 0 && (
                <button type="button" onClick={() => setShowPinned((v) => !v)}
                  className={`flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium transition ${showPinned ? "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"}`}
                  title="Pinned messages">
                  <Pin size={12} />
                  <span>{pinnedMessages.length}</span>
                </button>
              )}
              <button type="button" onClick={() => { setShowSearch((v) => !v); setTimeout(() => searchRef.current?.focus(), 50); }}
                className={`grid size-7 place-items-center rounded-full transition ${showSearch ? "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"}`}
                title="Search messages">
                <Search size={14} />
              </button>
              {openInChannelsHref && (
                <Link href={openInChannelsHref} className="text-xs font-medium text-[var(--color-secondary)]">Open</Link>
              )}
            </div>
          </div>
          {showSearch && (
            <div className="mt-3 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-subtle)] pointer-events-none" />
              <input ref={searchRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="h-8 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] pl-8 pr-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]" />
            </div>
          )}
          {statusMessage && (
            <p className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm text-[var(--color-muted)]">{statusMessage}</p>
          )}
        </header>
      ) : (
        <div className="shrink-0">
          {/* Fullscreen header: search + pinned on a compact bar */}
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
            <Hash size={14} className="shrink-0 text-[var(--color-muted)]" />
            <span className="flex-1 text-sm font-medium text-[var(--color-text)] truncate">{channel?.name ?? title}</span>
            {pinnedMessages.length > 0 && (
              <button type="button" onClick={() => setShowPinned((v) => !v)}
                className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition ${showPinned ? "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"}`}>
                <Pin size={11} />
                <span>{pinnedMessages.length}</span>
              </button>
            )}
            <button type="button" onClick={() => { setShowSearch((v) => !v); setTimeout(() => searchRef.current?.focus(), 50); }}
              className={`grid size-7 place-items-center rounded-full transition ${showSearch ? "bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]" : "text-[var(--color-muted)] hover:bg-[var(--color-surface-mid)]"}`}>
              <Search size={14} />
            </button>
          </div>
          {showSearch && (
            <div className="border-b border-[var(--color-border)] px-4 py-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-subtle)] pointer-events-none" />
                <input ref={searchRef} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages…"
                  className="h-8 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] pl-8 pr-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-secondary)]" />
              </div>
            </div>
          )}
          {statusMessage && (
            <div className="border-b border-[var(--color-border)] px-5 py-2">
              <p className="text-sm text-[var(--color-muted)]">{statusMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* Pinned messages banner */}
      {showPinned && pinnedMessages.length > 0 && (
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-secondary-dim)] px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            <Pin size={11} /> Pinned messages
          </p>
          <div className="space-y-1.5">
            {pinnedMessages.map((m) => (
              <div key={m.id} className="flex items-start gap-2 rounded-xl bg-[var(--color-surface)] px-3 py-2">
                <Avatar name={m.sender.displayName} avatarUrl={m.sender.avatarUrl} size={20} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--color-muted)]">{m.sender.displayName}</p>
                  <p className="truncate text-xs text-[var(--color-text)]">{m.body}</p>
                </div>
                {canModerateChat && (
                  <button type="button" onClick={() => togglePin(m)} className="shrink-0 text-[var(--color-muted)] hover:text-[var(--color-danger)]" title="Unpin">
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className={messagesClass}>
        {searchQuery && displayMessages.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
            No messages matching &ldquo;{searchQuery}&rdquo;
          </p>
        )}
        {!searchQuery && channel && messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] p-4 text-sm text-[var(--color-muted)]">{emptyText}</p>
        )}
        {displayMessages.map((message) => {
          const isOwn = message.senderUserId === currentUserId;
          const canEdit = isOwn && !message.deletedAt && !message.isPending;
          const canDelete = !message.deletedAt && !message.isPending && (isOwn || canModerateChat);
          const isEditing = editingMessageId === message.id;

          return (
            <article key={message.id}
              className={`flex min-w-0 items-start gap-2.5 ${isOwn ? "flex-row-reverse" : "flex-row"} ${message.isFirstInGroup && !isOwn ? "mt-3" : "mt-0.5"}`}
            >
              {!isOwn && (
                <Link href={`/profile/${message.senderUserId}`} className="mt-0.5 shrink-0 rounded-full transition hover:opacity-80">
                  <Avatar name={message.sender.displayName} avatarUrl={message.sender.avatarUrl} size={28} />
                </Link>
              )}

              <div className={`flex max-w-[80%] flex-col gap-0.5 sm:max-w-[72%] ${isOwn ? "items-end" : "items-start"}`}>
                {!isOwn && message.isFirstInGroup && (
                  <Link href={`/profile/${message.senderUserId}`} className="max-w-full truncate px-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-secondary)] hover:underline">{message.sender.displayName}</Link>
                )}

                {isEditing ? (
                  <form onSubmit={(e) => editMessage(e, message.id)}
                    className="grid w-[min(100%,360px)] gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                    <textarea name="body" required maxLength={maxMessageLength} defaultValue={message.body} rows={2}
                      onInput={(e) => autoGrowTextarea(e.currentTarget)}
                      className="max-h-40 min-h-16 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-secondary)]" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingMessageId("")}
                        className="grid size-9 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]">
                        <X size={16} />
                      </button>
                      <button className="grid size-9 place-items-center rounded-full bg-[var(--color-secondary)] text-white transition hover:bg-[var(--color-secondary-hover)]">
                        <Check size={16} />
                      </button>
                    </div>
                  </form>
                ) : (() => {
                  if (message.deletedAt) {
                    return (
                      <div className={`max-w-full rounded-2xl px-3 py-2 text-sm italic opacity-60 ${isOwn ? "rounded-br-sm bg-[var(--color-secondary)] text-white" : "rounded-bl-sm bg-[var(--color-surface-high)] text-[var(--color-text)]"}`}>
                        Message deleted
                      </div>
                    );
                  }
                  const isAttachmentOnly = !!message.attachmentFile &&
                    message.body.trim() === message.attachmentFile.name.trim();
                  if (isAttachmentOnly) {
                    if (!message.replyTo) return null;
                    return (
                      <div className={`flex items-start gap-1.5 rounded-lg border-l-2 px-2 py-1 ${isOwn ? "border-white/40 bg-[var(--color-secondary-dim)]/30" : "border-[var(--color-secondary)] bg-[var(--color-surface-mid)]"}`}>
                        <Reply size={10} className="mt-0.5 shrink-0 text-[var(--color-secondary)]" />
                        <span className="min-w-0 truncate text-xs text-[var(--color-muted)]">
                          <span className="font-semibold">{message.replyTo.sender.displayName}</span>
                          <span className="ml-1">{truncate(message.replyTo.body, 50)}</span>
                        </span>
                      </div>
                    );
                  }

                  const tokens = tokenize(message.body);
                  const isPureBlock = tokens.length === 1 && (tokens[0].type === "code-block" || tokens[0].type === "math-block");

                  if (isPureBlock) {
                    // No bubble — render as a standalone flat card so there's no box-inside-box
                    return (
                      <div className={`max-w-full ${message.isPending ? "opacity-60" : ""}`}>
                        {message.replyTo && (
                          <div className={`mb-1 flex items-start gap-1.5 rounded-lg border-l-2 px-2 py-1 ${isOwn ? "border-white/40 bg-[var(--color-secondary-dim)]/30" : "border-[var(--color-secondary)] bg-[var(--color-surface-mid)]"}`}>
                            <Reply size={10} className="mt-0.5 shrink-0 text-[var(--color-secondary)]" />
                            <span className="min-w-0 truncate text-xs text-[var(--color-muted)]">
                              <span className="font-semibold">{message.replyTo.sender.displayName}</span>
                              <span className="ml-1">{truncate(message.replyTo.body, 50)}</span>
                            </span>
                          </div>
                        )}
                        <MessageBody body={message.body} isOwn={false} members={members} />
                      </div>
                    );
                  }

                  return (
                    <div className={`max-w-full rounded-2xl text-sm leading-relaxed ${
                      isOwn ? "rounded-br-sm bg-[var(--color-secondary)] text-white" : "rounded-bl-sm bg-[var(--color-surface-high)] text-[var(--color-text)]"
                    } ${message.isPending ? "opacity-60" : ""}`}>
                      {message.replyTo && (
                        <div className={`mx-3 mt-2.5 mb-1.5 flex items-start gap-1.5 rounded-lg border-l-2 pl-2.5 py-1.5 pr-2 ${
                          isOwn ? "border-white/40 bg-white/10" : "border-[var(--color-secondary)] bg-[var(--color-surface-mid)]"
                        }`}>
                          <Reply size={10} className={`mt-0.5 shrink-0 ${isOwn ? "text-white/60" : "text-[var(--color-secondary)]"}`} />
                          <div className="min-w-0">
                            <p className={`text-[11px] font-semibold leading-tight ${isOwn ? "text-white/90" : "text-[var(--color-secondary)]"}`}>
                              {message.replyTo.sender.displayName}
                            </p>
                            <p className={`mt-0.5 truncate text-[11px] leading-tight ${isOwn ? "text-white/60" : "text-[var(--color-muted)]"}`}>
                              {truncate(message.replyTo.body, 60)}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="px-3 py-2 sm:px-4">
                        <MessageBody body={message.body} isOwn={isOwn} members={members} />
                      </div>
                    </div>
                  );
                })()}

                {/* Link unfurl — show preview for the first URL in the message */}
                {!message.deletedAt && !message.isPending && (() => {
                  const url = extractFirstUrl(message.body);
                  return url ? <URLPreview key={url} url={url} /> : null;
                })()}

                {/* Attachment */}
                {message.attachmentFile && !message.deletedAt && (
                  <AttachmentCard file={message.attachmentFile} />
                )}

                {/* Reactions */}
                {message.reactions.length > 0 && !message.deletedAt && (
                  <div className={`flex flex-wrap gap-1 px-1 ${isOwn ? "justify-end" : ""}`}>
                    {message.reactions.map((r) => {
                      const reacted = r.userIds.includes(currentUserId);
                      return (
                        <button key={r.emoji} type="button"
                          onClick={() => toggleReaction(message.id, r.emoji)}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                            reacted
                              ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:border-[var(--color-secondary)]"
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span className="font-mono font-bold">{r.userIds.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Timestamp */}
                {message.isLastInGroup && (
                  <span className={`px-3 text-[10px] text-[var(--color-subtle)] ${isOwn ? "text-right" : ""}`}>
                    {formatMessageTime(message.createdAt)}
                    {message.editedAt && !message.deletedAt ? " · edited" : ""}
                    {message.isPinned && !message.deletedAt ? " · 📌" : ""}
                    {message.isPending ? " · sending" : ""}
                  </span>
                )}

                {/* Action buttons */}
                {!isEditing && !message.deletedAt && !message.isPending && (
                  <div className={`flex items-center gap-0.5 px-1 ${isOwn ? "justify-end" : ""}`} data-emoji-picker>
                    {/* React */}
                    <div className="relative" data-emoji-picker>
                      <button type="button" onClick={() => setEmojiPickerForId((id) => id === message.id ? null : message.id)}
                        className="grid size-7 place-items-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-secondary)]" title="React">
                        <Smile size={14} />
                      </button>
                      {emojiPickerForId === message.id && (
                        <div data-emoji-picker className={`absolute bottom-9 z-30 w-[216px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg ${isOwn ? "right-0" : "left-0"}`}>
                          <div className="grid grid-cols-6 gap-1">
                            {COMMON_EMOJIS.map((emoji) => (
                              <button key={emoji} type="button" onClick={() => toggleReaction(message.id, emoji)}
                                className="grid size-8 place-items-center rounded-lg text-base transition hover:bg-[var(--color-surface-mid)]">
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Reply */}
                    <button type="button" onClick={() => { setReplyingTo(message); inputRef.current?.focus(); }}
                      className="grid size-7 place-items-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-secondary)]" title="Reply">
                      <Reply size={14} />
                    </button>
                    {/* Pin (admin only) */}
                    {canModerateChat && (
                      <button type="button" onClick={() => togglePin(message)}
                        className={`grid size-7 place-items-center rounded-full transition hover:bg-[var(--color-surface-mid)] ${message.isPinned ? "text-[var(--color-secondary)]" : "text-[var(--color-subtle)] hover:text-[var(--color-secondary)]"}`}
                        title={message.isPinned ? "Unpin" : "Pin"}>
                        {message.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => setEditingMessageId(message.id)}
                        className="grid size-7 place-items-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-secondary)]" title="Edit">
                        <Edit2 size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => deleteMessage(message.id)}
                        className="grid size-7 place-items-center rounded-full text-[var(--color-danger)] transition hover:bg-[var(--color-danger-dim)]" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Composer */}
      <footer className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
        {typingUsers.length > 0 && (
          <div className="mb-3 flex items-center gap-2 px-1 text-xs text-[var(--color-subtle)]">
            <ThreeDotsAnimation />
            <span className="min-w-0 truncate">{formatTypingUsers(typingUsers)}</span>
          </div>
        )}

        {/* Reply banner */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--color-secondary-dim)] bg-[var(--color-secondary-dim)] px-3 py-2 text-xs">
            <Reply size={12} className="shrink-0 text-[var(--color-secondary)]" />
            <span className="min-w-0 flex-1 truncate text-[var(--color-secondary)]">
              <span className="font-semibold">{replyingTo.sender.displayName}</span>
              {" · "}{truncate(replyingTo.body, 60)}
            </span>
            <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-[var(--color-secondary)] hover:opacity-70">
              <X size={12} />
            </button>
          </div>
        )}

        {channel && canPostMessages ? (
          <div className="relative">
            {/* @mention dropdown */}
            {mentionQuery !== null && mentionMembers.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                {mentionMembers.map((m) => (
                  <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition hover:bg-[var(--color-surface-low)]">
                    <Avatar name={m.displayName} avatarUrl={m.avatarUrl} size={24} />
                    <span className="font-medium text-[var(--color-text)]">{m.displayName}</span>
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={sendMessage} className="flex min-w-0 items-end gap-2">
              {/* File attachment */}
              <input ref={fileInputRef} type="file" className="sr-only" onChange={handleAttachment}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={attachmentPending}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] disabled:opacity-40"
                title="Attach file">
                <Paperclip size={15} />
              </button>

              <textarea ref={inputRef} name="body" required maxLength={maxMessageLength}
                placeholder={placeholder} rows={1}
                onInput={handleInputChange} onKeyDown={handleComposerKeyDown}
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm leading-5 text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]" />

              <button type="submit"
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-secondary)] text-white transition hover:bg-[var(--color-secondary-hover)]"
                aria-label="Send">
                <SendHorizontal size={18} />
              </button>
            </form>
          </div>
        ) : channel ? (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">{readOnlyText}</p>
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
            Create a channel before sending messages.
          </p>
        )}
      </footer>
    </section>
  );
}

// ── MessageBody ───────────────────────────────────────────────────────────────

type BodyToken =
  | { type: "text"; value: string }
  | { type: "code-block"; lang: string; code: string }
  | { type: "inline-code"; value: string }
  | { type: "math-block"; value: string }
  | { type: "math-inline"; value: string };

function tokenize(body: string): BodyToken[] {
  const tokens: BodyToken[] = [];
  // Split on code blocks first
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRe.exec(body)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: body.slice(last, m.index) });
    tokens.push({ type: "code-block", lang: m[1] || "plaintext", code: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < body.length) tokens.push({ type: "text", value: body.slice(last) });

  // Expand text tokens into inline-code / math
  const expanded: BodyToken[] = [];
  for (const tok of tokens) {
    if (tok.type !== "text") { expanded.push(tok); continue; }
    const rest = tok.value;
    const inlineRe = /(`[^`]+`|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    let pos = 0;
    let im: RegExpExecArray | null;
    const temp: BodyToken[] = [];
    while ((im = inlineRe.exec(rest)) !== null) {
      if (im.index > pos) temp.push({ type: "text", value: rest.slice(pos, im.index) });
      const raw = im[0];
      if (raw.startsWith("$$")) temp.push({ type: "math-block", value: raw.slice(2, -2).trim() });
      else if (raw.startsWith("$")) temp.push({ type: "math-inline", value: raw.slice(1, -1).trim() });
      else temp.push({ type: "inline-code", value: raw.slice(1, -1) });
      pos = im.index + raw.length;
    }
    if (pos < rest.length) temp.push({ type: "text", value: rest.slice(pos) });
    expanded.push(...temp);
  }
  return expanded;
}

function MessageBody({ body, isOwn, members }: { body: string; isOwn: boolean; members: Member[] }) {
  const tokens = useMemo(() => tokenize(body), [body]);

  return (
    <span className="whitespace-pre-wrap break-words">
      {tokens.map((tok, i) => {
        if (tok.type === "code-block") {
          let highlighted = tok.code;
          if (tok.lang && tok.lang !== "plaintext" && tok.lang !== "text" && hljs.getLanguage(tok.lang)) {
            try {
              highlighted = hljs.highlight(tok.code, { language: tok.lang, ignoreIllegals: true }).value;
            } catch { /* fallback to plain */ }
          }
          return (
            <span key={i} className="my-1 block overflow-x-auto">
              {tok.lang && tok.lang !== "plaintext" && tok.lang !== "text" && (
                <span className={`mb-1 block font-mono text-[10px] font-bold uppercase tracking-widest ${isOwn ? "opacity-60" : "text-[var(--color-muted)]"}`}>
                  {tok.lang}
                </span>
              )}
              <code
                className={`block rounded-xl p-3 font-mono text-xs leading-relaxed ${
                  isOwn ? "bg-black/25 text-white/90" : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
                }`}
                dangerouslySetInnerHTML={{ __html: highlighted }}
              />
            </span>
          );
        }
        if (tok.type === "inline-code") {
          return (
            <code key={i} className={`rounded px-1 py-0.5 font-mono text-xs ${isOwn ? "bg-white/20" : "bg-[var(--color-surface-high)]"}`}>
              {tok.value}
            </code>
          );
        }
        if (tok.type === "math-block" || tok.type === "math-inline") {
          let rendered = tok.value;
          try {
            rendered = katex.renderToString(tok.value, { displayMode: tok.type === "math-block", throwOnError: false });
          } catch { /* invalid latex */ }
          return (
            <span key={i}
              className={tok.type === "math-block" ? "my-1 block" : ""}
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          );
        }
        // Plain text — highlight @mentions and URLs
        return <InlineText key={i} text={tok.value} isOwn={isOwn} members={members} />;
      })}
    </span>
  );
}

function InlineText({ text, isOwn, members }: { text: string; isOwn: boolean; members: Member[] }) {
  const parts = useMemo(() => {
    const memberNames = new Set(members.map((m) => m.displayName.toLowerCase()));
    // Split on @mentions and URLs
    const re = /(@\w[\w\s]*?\b)|(https?:\/\/[^\s]+)/g;
    const result: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) result.push(text.slice(last, m.index));
      const raw = m[0];
      if (raw.startsWith("@")) {
        const name = raw.slice(1).trim().toLowerCase();
        const isMember = memberNames.has(name);
        result.push(
          <span key={m.index}
            className={isMember ? (isOwn ? "font-semibold text-white/90 underline decoration-white/40" : "font-semibold text-[var(--color-secondary)]") : undefined}>
            {raw}
          </span>
        );
      } else {
        result.push(
          <a key={m.index} href={raw} target="_blank" rel="noopener noreferrer"
            className={isOwn ? "underline text-white/90" : "text-[var(--color-secondary)] underline"}>
            {raw}
          </a>
        );
      }
      last = m.index + raw.length;
    }
    if (last < text.length) result.push(text.slice(last));
    return result;
  }, [text, isOwn, members]);

  return <>{parts}</>;
}

// ── URL preview card ──────────────────────────────────────────────────────────

function URLPreview({ url }: { url: string }) {
  const [data, setData] = useState<{ title: string; description?: string; image?: string; siteName?: string } | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (tried) return;
    setTried(true);
    fetch(`/api/unfurl?url=${encodeURIComponent(url)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.title) setData(d); })
      .catch(() => {});
  }, [url, tried]);

  if (!data) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="mt-1.5 flex max-w-[280px] flex-col gap-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] no-underline transition hover:border-[var(--color-secondary)]">
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.image} alt="" className="h-32 w-full object-cover" />
      )}
      <div className="px-3 py-2.5">
        {data.siteName && <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-muted)]">{data.siteName}</p>}
        <p className="mt-0.5 text-sm font-semibold leading-snug text-[var(--color-text)] line-clamp-2">{data.title}</p>
        {data.description && <p className="mt-0.5 text-xs text-[var(--color-muted)] line-clamp-2">{data.description}</p>}
      </div>
    </a>
  );
}

// ── Attachment card ───────────────────────────────────────────────────────────

function AttachmentCard({ file }: { file: NonNullable<RealtimeChatMessage["attachmentFile"]> }) {
  const isImage = file.mimeType.startsWith("image/");
  const href = `/api/files/${file.id}`;

  if (isImage) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.publicUrl ?? href}
          alt={file.name}
          className="max-w-[280px] rounded-2xl"
          style={{ maxHeight: 320, display: "block" }}
        />
      </a>
    );
  }

  const { label, colorClass } = fileTypeStyle(file.mimeType, file.name);

  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="mt-1 flex w-[280px] max-w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 no-underline transition hover:border-[var(--color-secondary)]">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-[10px] font-bold tracking-wide ${colorClass}`}>
        {label}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{file.name}</p>
        {file.sizeBytes != null && <p className="text-xs text-[var(--color-muted)]">{formatBytes(file.sizeBytes)}</p>}
      </div>
      <ExternalLink size={14} className="shrink-0 text-[var(--color-subtle)]" />
    </a>
  );
}

function fileTypeStyle(mimeType: string, name: string): { label: string; colorClass: string } {
  const ext = (name.split(".").pop() ?? "FILE").toUpperCase().slice(0, 4);
  if (mimeType === "application/pdf") return { label: "PDF", colorClass: "bg-red-50 text-red-600" };
  if (mimeType.includes("word") || /\.docx?$/i.test(name)) return { label: ext, colorClass: "bg-blue-50 text-blue-600" };
  if (mimeType.includes("spreadsheet") || mimeType === "text/csv" || /\.(xlsx?|csv)$/i.test(name)) return { label: ext, colorClass: "bg-green-50 text-green-600" };
  return { label: ext, colorClass: "bg-[var(--color-surface-high)] text-[var(--color-muted)]" };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function PanelHeader({ title, openInChannelsHref }: { title: string; openInChannelsHref?: string }) {
  return (
    <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-semibold text-[var(--color-text)]">{title}</p>
        {openInChannelsHref && (
          <Link href={openInChannelsHref} className="shrink-0 text-sm font-medium text-[var(--color-secondary)]">Open</Link>
        )}
      </div>
    </header>
  );
}

function sectionClass(variant: "fullscreen" | "card") {
  return variant === "fullscreen"
    ? "flex h-full min-h-0 flex-col bg-[var(--color-surface)]"
    : "flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm";
}

async function writeMessage(method: "POST" | "PATCH" | "DELETE", body: object) {
  try {
    const res = await fetch("/api/chat/messages", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await res.json();
    if (!res.ok || !payload?.message) return null;
    return payload.message as RealtimeChatMessage;
  } catch { return null; }
}

function groupMessages(messages: RealtimeChatMessage[]): MessageWithGroup[] {
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const prevBreak = prev ? new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000 : true;
    const nextBreak = next ? new Date(next.createdAt).getTime() - new Date(message.createdAt).getTime() > 5 * 60 * 1000 : true;
    const samePrev = prev?.senderUserId === message.senderUserId && !prev.deletedAt && !message.deletedAt;
    const sameNext = next?.senderUserId === message.senderUserId && !next.deletedAt && !message.deletedAt;
    return { ...message, isFirstInGroup: !samePrev || prevBreak, isLastInGroup: !sameNext || nextBreak };
  });
}

function Avatar({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const colors = ["#085ac0", "#2170e4", "#004395", "#0041a8"];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ width: size, height: size, background: color }}>
      {getInitials(name)}
    </div>
  );
}

function ThreeDotsAnimation() {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-[var(--color-muted)]" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function resetTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "";
  el.rows = 1;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTypingUsers(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function getUserInfoName(info: { name?: string; email?: string } | undefined) {
  return info?.name ?? info?.email ?? "Someone";
}

function getInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function extractFirstUrl(text: string): string | null {
  const m = /https?:\/\/[^\s]+/.exec(text);
  return m ? m[0] : null;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function getChatStatusMessage(status?: string | null) {
  switch (status) {
    case "invalid": return "Message cannot be empty.";
    case "too-long": return "Message is too long.";
    case "send-failed": return "Could not send. Try again.";
    case "update-failed": return "Could not update. Try again.";
    case "delete-failed": return "Could not delete. Try again.";
    case "attachment-failed": return "Could not upload attachment. Try again.";
    default: return null;
  }
}
