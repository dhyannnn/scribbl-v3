"use client";

import { useEffect, useRef, useState } from "react";

export type ToastItem = {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

export function NotificationToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 items-end">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Animate in
    const frame = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 4 s
    timerRef.current = setTimeout(() => dismiss(), 4000);
    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 250);
  }

  const inner = (
    <div
      className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-lg"
      style={{
        minWidth: 260,
        maxWidth: 340,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
      }}
    >
      <span className="mt-0.5 text-[var(--color-secondary)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{toast.body}</p>
        )}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-[var(--color-subtle)] hover:text-[var(--color-muted)] transition"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  if (toast.href) {
    return (
      <a href={toast.href} onClick={dismiss}>
        {inner}
      </a>
    );
  }

  return inner;
}
