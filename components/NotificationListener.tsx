"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationToastStack, type ToastItem } from "./NotificationToast";

const POLL_INTERVAL_MS = 20_000;

function playDing() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1108, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.8);
    osc2.stop(now + 0.8);

    // Clean up after playback
    osc1.onended = () => ctx.close();
  } catch {
    // AudioContext blocked or unavailable — silently skip
  }
}

export function NotificationListener() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const sinceRef = useRef<string>(new Date().toISOString());
  const soundEnabledRef = useRef<boolean>(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/notifications/poll?since=${encodeURIComponent(sinceRef.current)}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) return;

      const data = await res.json() as {
        notifications: { id: string; title: string; body: string | null; href: string | null }[];
        soundEnabled: boolean;
      };

      soundEnabledRef.current = data.soundEnabled;
      sinceRef.current = new Date().toISOString();

      if (data.notifications.length === 0) return;

      if (soundEnabledRef.current) {
        playDing();
      }

      // Browser notification when tab is in background
      if (document.hidden && Notification.permission === "granted") {
        data.notifications.forEach((n) => {
          new Notification(n.title, { body: n.body ?? undefined, icon: "/favicon.ico" });
        });
      }

      setToasts((prev) => [
        ...data.notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          href: n.href,
        })),
        ...prev,
      ].slice(0, 5));
    } catch {
      // Network error — silently skip until next poll
    }
  }, []);

  useEffect(() => {
    // Request browser notification permission once on mount
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (toasts.length === 0) return null;

  return <NotificationToastStack toasts={toasts} onDismiss={dismiss} />;
}
