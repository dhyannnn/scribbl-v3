"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SIDEBAR_W = 256; // px — matches w-64
const OPEN_KEY = "scribbl-sidebar-open";

export function WorkspaceSidebarShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Must start with the same value on server and client to avoid hydration mismatch.
  // We use `true` (open) as the SSR default, then correct from localStorage in useEffect.
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Run once after hydration — read persisted preference or apply route default.
  useEffect(() => {
    const stored = localStorage.getItem(OPEN_KEY);
    if (stored !== null) {
      setOpen(stored === "true");
    } else if (/\/meetings\//.test(pathname)) {
      setOpen(false);
    }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist preference and keep CSS var in sync
  useEffect(() => {
    if (!hydrated) return; // don't persist the SSR default
    localStorage.setItem(OPEN_KEY, String(open));
    document.documentElement.style.setProperty(
      "--scribbl-sidebar-w",
      open ? `${SIDEBAR_W}px` : "0px",
    );
  }, [open, hydrated]);

  // Close mobile overlay on navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">

      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <div
        className="hidden shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ease-in-out md:block"
        style={{ width: open ? SIDEBAR_W : 0 }}
      >
        {/* Fixed-width inner — sidebar content never wraps during width transition */}
        <div style={{ width: SIDEBAR_W }}>
          {sidebar}
        </div>
      </div>

      {/* ── Desktop toggle button ────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`fixed top-4 z-40 hidden size-6 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:bg-[var(--color-surface-mid)] md:flex ${hydrated ? "transition-all duration-200" : ""}`}
        style={{ left: open ? SIDEBAR_W - 12 : 8 }}
        title={open ? "Collapse sidebar" : "Expand sidebar"}
      >
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          {open ? <path d="M6.5 2L3.5 5l3 3" /> : <path d="M3.5 2L6.5 5l-3 3" />}
        </svg>
      </button>

      {/* ── Mobile sidebar (off-canvas) ──────────────────────────────── */}
      <div className="md:hidden">
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <div
          className={`fixed left-0 top-0 z-50 h-full overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-200 ease-in-out`}
          style={{
            width: SIDEBAR_W,
            transform: mobileOpen ? "translateX(0)" : `translateX(-${SIDEBAR_W}px)`,
          }}
        >
          {sidebar}
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="fixed left-3 top-3 z-50 flex size-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm hover:bg-[var(--color-surface-mid)]"
          title="Toggle menu"
        >
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            {mobileOpen
              ? <><line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" /></>
              : <><line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" /></>
            }
          </svg>
        </button>
      </div>

      {/* ── Main content — scrolls independently of the sidebar ─────── */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
