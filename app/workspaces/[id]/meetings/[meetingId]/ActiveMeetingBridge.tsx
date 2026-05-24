"use client";

import { useEffect } from "react";
import { useActiveMeeting, type ActiveMeetingData } from "@/components/ActiveMeetingContext";

export function ActiveMeetingBridge(props: ActiveMeetingData) {
  const { setActiveMeeting, setVideoHidden } = useActiveMeeting();

  useEffect(() => {
    setActiveMeeting(props);
    // Un-hide the video panel whenever the bridge (re-)registers — i.e. when the
    // user arrives or returns to this meeting hub.
    setVideoHidden(false);
    // Intentionally no cleanup — video persists across navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.meetingId, props.workspaceId]);

  return null;
}
