"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

export function PermissionSubmitButton({
  children,
  className,
  meetingId,
  pendingLabel = "Saving...",
  targetType,
}: {
  children: ReactNode;
  className: string;
  meetingId?: string;
  pendingLabel?: string;
  targetType?: string;
}) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPendingRef.current = true;
      return undefined;
    }

    if (!wasPendingRef.current) {
      return undefined;
    }

    wasPendingRef.current = false;
    if (meetingId && isVideoPermissionTarget(targetType)) {
      const channel = new BroadcastChannel(`scribbl-video-${meetingId}`);
      channel.postMessage({ type: "permissions-updated" });
      window.setTimeout(() => channel.close(), 150);
    }

    const timeout = window.setTimeout(() => router.refresh(), 150);
    return () => window.clearTimeout(timeout);
  }, [meetingId, pending, router, targetType]);

  return (
    <button className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function isVideoPermissionTarget(value?: string) {
  return value === "MICROPHONE" || value === "CAMERA" || value === "SCREEN_SHARE";
}
