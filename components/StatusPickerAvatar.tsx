"use client";

import { useEffect, useRef, useState } from "react";
import type { UserStatus } from "@prisma/client";
import { updateUserStatus } from "@/app/actions/status";

const STATUS_CONFIG: Record<UserStatus, { label: string; dotClass: string }> = {
  ONLINE:     { label: "Online",      dotClass: "bg-green-500" },
  BUSY:       { label: "Busy",        dotClass: "bg-yellow-400" },
  AWAY:       { label: "Away",        dotClass: "bg-gray-400" },
  IN_MEETING: { label: "In a Meeting", dotClass: "bg-purple-500" },
};

const SELECTABLE: UserStatus[] = ["ONLINE", "BUSY", "AWAY"];

const AUTO_AWAY_MS = 10 * 60 * 1000;

type Props = {
  initialStatus: UserStatus;
  name: string;
  avatarUrl?: string | null;
  sizeClassName?: string;
};

export function StatusPickerAvatar({
  initialStatus,
  name,
  avatarUrl,
  sizeClassName = "h-8 w-8",
}: Props) {
  const [status, setStatus] = useState<UserStatus>(initialStatus);
  const [open, setOpen] = useState(false);
  const wasAutoAwayRef = useRef(false);
  const awayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Auto-Away on tab hide (only when ONLINE); revert on tab visible if auto-set
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        if (status === "ONLINE") {
          awayTimerRef.current = setTimeout(() => {
            wasAutoAwayRef.current = true;
            setStatus("AWAY");
            void updateUserStatus("AWAY");
          }, AUTO_AWAY_MS);
        }
      } else {
        if (awayTimerRef.current !== null) {
          clearTimeout(awayTimerRef.current);
          awayTimerRef.current = null;
        }
        if (wasAutoAwayRef.current) {
          wasAutoAwayRef.current = false;
          setStatus("ONLINE");
          void updateUserStatus("ONLINE");
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (awayTimerRef.current !== null) clearTimeout(awayTimerRef.current);
    };
  }, [status]);

  async function handleSelect(next: UserStatus) {
    wasAutoAwayRef.current = false;
    setStatus(next);
    setOpen(false);
    await updateUserStatus(next);
  }

  const { dotClass } = STATUS_CONFIG[status];

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className="relative block rounded-full focus:outline-none"
        title="Set status"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className={`${sizeClassName} rounded-full object-cover`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={`${sizeClassName} flex items-center justify-center rounded-full bg-[var(--color-secondary)] text-xs font-semibold text-white`}>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] ${dotClass}`}
        />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg">
          {SELECTABLE.map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => void handleSelect(s)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-[var(--color-surface-mid)] ${status === s ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)]"}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dotClass}`} />
                {cfg.label}
                {status === s ? (
                  <span className="ml-auto text-[var(--color-secondary)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
          {status === "IN_MEETING" ? (
            <div className="flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-[var(--color-text)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_CONFIG.IN_MEETING.dotClass}`} />
              In a Meeting
              <span className="ml-auto text-[var(--color-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Lightweight read-only dot for members lists
export function StatusDot({ status, className = "" }: { status: UserStatus; className?: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] ${STATUS_CONFIG[status].dotClass} ${className}`}
      title={STATUS_CONFIG[status].label}
    />
  );
}
