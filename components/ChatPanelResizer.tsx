"use client";

import { useCallback, useRef } from "react";

const PANEL_CSS_VAR = "--scribbl-chat-panel-width";
const MIN_WIDTH = 220;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 288;

export function ChatPanelResizer() {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;

    const panel = document.querySelector("[data-chat-right-panel]") as HTMLElement | null;
    startWidth.current = panel?.offsetWidth ?? DEFAULT_WIDTH;

    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      document.documentElement.style.setProperty(PANEL_CSS_VAR, `${newWidth}px`);
    }

    function onUp() {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center"
      title="Drag to resize"
    >
      <div className="h-16 w-0.5 rounded-full bg-[var(--color-border)] transition-all group-hover:h-24 group-hover:bg-[var(--color-secondary)] group-active:bg-[var(--color-secondary)]" />
    </div>
  );
}
