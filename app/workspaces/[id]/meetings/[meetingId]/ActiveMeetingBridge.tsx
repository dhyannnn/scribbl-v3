"use client";

import { useEffect } from "react";
import { useActiveMeeting, type ActiveMeetingData } from "@/components/ActiveMeetingContext";

export function ActiveMeetingBridge(props: ActiveMeetingData) {
  const { setActiveMeeting } = useActiveMeeting();

  useEffect(() => {
    setActiveMeeting(props);
    // Intentionally no cleanup — video persists across navigation.
    // Cleared only when user explicitly leaves (via onAfterLeave in WorkspaceVideoOverlay).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.meetingId, props.workspaceId]);

  return null;
}
