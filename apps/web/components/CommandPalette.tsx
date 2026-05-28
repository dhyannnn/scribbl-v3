"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  workspaces: { id: string; name: string; type: string }[];
  notes: { id: string; title: string; type: string; workspaceId: string | null }[];
  meetings: { id: string; title: string; startsAt: string; workspaceId: string }[];
  channels: { id: string; name: string; type: string; workspaceId: string }[];
};

type Item = {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  href: string;
};

const WorkspaceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </svg>
);

const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

const WhiteboardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="M7 9l3 3 4-4" />
  </svg>
);

const MeetingIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ChannelIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const HelpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const STATIC_ACTIONS: Item[] = [
  {
    id: "action-dashboard",
    label: "Go to Dashboard",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
    href: "/",
  },
  {
    id: "action-calendar",
    label: "Open Calendar",
    icon: <MeetingIcon />,
    href: "/calendar",
  },
  {
    id: "action-notifications",
    label: "Notifications",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>,
    href: "/notifications",
  },
  {
    id: "action-help",
    label: "Help & Documentation",
    icon: <HelpIcon />,
    href: "/help",
  },
  {
    id: "action-account",
    label: "Account Settings",
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /></svg>,
    href: "/account",
  },
];

function buildItems(data: SearchResult | null, query: string): { section: string; items: Item[] }[] {
  if (!data) return [{ section: "Actions", items: STATIC_ACTIONS }];

  const sections: { section: string; items: Item[] }[] = [];

  if (data.workspaces.length > 0) {
    sections.push({
      section: "Workspaces",
      items: data.workspaces.map((w) => ({
        id: `ws-${w.id}`,
        label: w.name,
        sublabel: w.type.charAt(0) + w.type.slice(1).toLowerCase(),
        icon: <WorkspaceIcon />,
        href: `/workspaces/${w.id}`,
      })),
    });
  }

  if (data.notes.length > 0) {
    sections.push({
      section: "Notes",
      items: data.notes.map((n) => ({
        id: `note-${n.id}`,
        label: n.title || "Untitled",
        sublabel: n.type === "WHITEBOARD" ? "Whiteboard" : "Note",
        icon: n.type === "WHITEBOARD" ? <WhiteboardIcon /> : <NoteIcon />,
        href: n.workspaceId ? `/workspaces/${n.workspaceId}/notes/${n.id}` : `/notes/${n.id}`,
      })),
    });
  }

  if (data.meetings.length > 0) {
    sections.push({
      section: "Meetings",
      items: data.meetings.map((m) => ({
        id: `meeting-${m.id}`,
        label: m.title || "Untitled Meeting",
        sublabel: new Date(m.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        icon: <MeetingIcon />,
        href: `/workspaces/${m.workspaceId}/meetings/${m.id}`,
      })),
    });
  }

  if (data.channels.length > 0) {
    sections.push({
      section: "Channels",
      items: data.channels.map((c) => ({
        id: `ch-${c.id}`,
        label: `#${c.name}`,
        sublabel: c.type === "ANNOUNCEMENT" ? "Announcements" : "Chat",
        icon: <ChannelIcon />,
        href: `/workspaces/${c.workspaceId}/chat/${c.id}`,
      })),
    });
  }

  if (sections.length === 0 && query) {
    return [];
  }

  if (!query) {
    sections.push({ section: "Actions", items: STATIC_ACTIONS });
  }

  return sections;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const fetchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global ⌘K / Ctrl+K toggle
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  const search = useCallback((q: string) => {
    if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    fetchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/command-search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json() as SearchResult;
          setResults(data);
          setSelectedIndex(0);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 150);
  }, []);

  useEffect(() => {
    if (open) search(query);
    return () => { if (fetchTimeout.current) clearTimeout(fetchTimeout.current); };
  }, [query, open, search]);

  const sections = buildItems(results, query);
  const flatItems = sections.flatMap((s) => s.items);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = flatItems[selectedIndex];
      if (item) navigate(item.href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[20vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="mx-4 w-full max-w-[560px] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-muted)]">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, meetings, workspaces…"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtle)]"
          />
          {loading && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 animate-spin text-[var(--color-muted)]">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          <kbd className="hidden shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-surface-mid)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted)] sm:block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {sections.length === 0 && query ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-subtle)]">
              No results for &ldquo;{query}&rdquo;
            </p>
          ) : (
            sections.map((section) => (
              <div key={section.section}>
                <p className="px-4 pb-1 pt-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-subtle)]">
                  {section.section}
                </p>
                {section.items.map((item) => {
                  const isSelected = flatIdx === selectedIndex;
                  const currentIdx = flatIdx;
                  flatIdx += 1;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                      onClick={() => navigate(item.href)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        isSelected
                          ? "bg-[var(--color-secondary)] text-white"
                          : "text-[var(--color-text)] hover:bg-[var(--color-surface-low)]"
                      }`}
                    >
                      <span className={`shrink-0 ${isSelected ? "text-white" : "text-[var(--color-muted)]"}`}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.label}</span>
                        {item.sublabel && (
                          <span className={`block truncate text-xs ${isSelected ? "text-white/70" : "text-[var(--color-subtle)]"}`}>
                            {item.sublabel}
                          </span>
                        )}
                      </span>
                      <kbd className={`hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:block ${
                        isSelected
                          ? "border-white/30 bg-white/10 text-white"
                          : "border-[var(--color-border)] bg-[var(--color-surface-mid)] text-[var(--color-muted)]"
                      }`}>
                        ↵
                      </kbd>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--color-subtle)]">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-mid)] px-1 py-0.5">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-mid)] px-1 py-0.5">↵</kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-mid)] px-1 py-0.5">esc</kbd>
              close
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--color-subtle)]">⌘K</span>
        </div>
      </div>
    </div>
  );
}
