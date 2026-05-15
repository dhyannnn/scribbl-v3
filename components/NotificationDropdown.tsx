"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type NotificationDropdownProps = {
  children: ReactNode;
  unreadCount: number;
};

export function NotificationDropdown({ children, unreadCount }: NotificationDropdownProps) {
  const [panelStyle, setPanelStyle] = useState({ left: 0, width: 360 });
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);

  function updatePanelPosition() {
    const rect = summaryRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const viewportPadding = 16;
    const width = Math.min(Math.max(window.innerWidth - viewportPadding * 2, 240), 360);
    const preferLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
    let left = preferLeft ? 0 : rect.width - width;
    const viewportLeft = rect.left + left;
    const viewportRight = viewportLeft + width;

    if (viewportLeft < viewportPadding) {
      left += viewportPadding - viewportLeft;
    }

    if (viewportRight > window.innerWidth - viewportPadding) {
      left -= viewportRight - (window.innerWidth - viewportPadding);
    }

    setPanelStyle({ left, width });
  }

  useEffect(() => {
    function handleResize() {
      if (detailsRef.current?.open) {
        updatePanelPosition();
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <details ref={detailsRef} className="relative shrink-0" onToggle={updatePanelPosition}>
      <summary
        ref={summaryRef}
        className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-[#c8c8bd] bg-white text-[#2f604b] transition hover:bg-[#eef5ef]"
        aria-label={unreadCount > 0 ? `Open notifications, ${unreadCount} unread` : "Open notifications"}
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#8a3328] px-1.5 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </summary>
      <div
        className="absolute top-full z-50 mt-2 rounded-md border border-[#d8d8ce] bg-white p-3 text-sm shadow-lg"
        style={{ left: panelStyle.left, width: panelStyle.width }}
      >
        {children}
      </div>
    </details>
  );
}
