"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateDmChannelId } from "@/app/workspaces/[id]/chat/actions";

type Member = { id: string; displayName: string; avatarUrl: string | null };

export function NewDmButton({ workspaceId, members }: { workspaceId: string; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const DROPDOWN_W = 220;

  const filtered = query.trim()
    ? members.filter((m) => m.displayName.toLowerCase().includes(query.toLowerCase()))
    : members;

  function handleOpen() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        // align dropdown right edge to button right edge, clamped to screen
        left: Math.max(8, Math.min(rect.right - DROPDOWN_W, window.innerWidth - DROPDOWN_W - 8)),
      });
    }
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
        ref={buttonRef}
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
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ top: pos.top, left: pos.left, width: DROPDOWN_W }}
            className="fixed z-50 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
          >
            <div className="border-b border-[var(--color-border)] p-2">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a member..."
                className="w-full rounded-lg bg-[var(--color-surface-low)] px-3 py-1.5 text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtle)]"
              />
            </div>
            <ul className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-[var(--color-subtle)]">No members found</li>
              ) : (
                filtered.map((m) => {
                  const initials = m.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(m.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]"
                      >
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-high)] text-[9px] font-bold text-[var(--color-muted)]">
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
        </>
      )}
    </>
  );
}
