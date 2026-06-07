"use client";

import { useTransition } from "react";
import { deleteChannel } from "@/app/workspaces/[id]/chat/actions";

type Props = {
  channelId: string;
  workspaceId: string;
  otherUserName: string;
  alwaysVisible?: boolean;
};

export function DeleteDmButton({ channelId, workspaceId, otherUserName, alwaysVisible }: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Close your conversation with ${otherUserName}?\n\nAll messages will be permanently deleted and cannot be recovered.`,
    );
    if (!confirmed) return;
    startTransition(() => {
      const fd = new FormData();
      fd.set("workspaceId", workspaceId);
      fd.set("channelId", channelId);
      deleteChannel(fd);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title="Close DM"
      className={`${alwaysVisible ? "flex" : "absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/dm:flex"} items-center justify-center h-5 w-5 rounded-full text-[var(--color-subtle)] hover:bg-[var(--color-surface-high)] hover:text-[var(--color-danger)] transition disabled:opacity-40`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
