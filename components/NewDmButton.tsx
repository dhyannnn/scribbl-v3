"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDmChannelId } from "@/app/workspaces/[id]/chat/actions";

type Member = { id: string; displayName: string; avatarUrl: string | null };

export function NewDmButton({ workspaceId, members }: { workspaceId: string; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? members.filter((m) => m.displayName.toLowerCase().includes(query.toLowerCase()))
    : members;

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(memberId: string) {
    setOpen(false);
    startTransition(async () => {
      const channelId = await getOrCreateDmChannelId(workspaceId, memberId);
      if (channelId) router.push(`/workspaces/${workspaceId}/chat/${channelId}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={isPending}
        title="New direct message"
        className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface-high)] hover:text-[var(--color-muted)] disabled:opacity-40"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-[var(--color-border)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">New Direct Message</p>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a member..."
                className="w-full rounded-lg bg-[var(--color-surface-low)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtle)] focus:ring-1 focus:ring-[var(--color-secondary)]"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-sm text-[var(--color-subtle)]">No members found</li>
              ) : (
                filtered.map((m) => {
                  const initials = m.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(m.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-high)] text-xs font-bold text-[var(--color-muted)]">
                            {initials}
                          </span>
                        )}
                        <span className="truncate">{m.displayName}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
