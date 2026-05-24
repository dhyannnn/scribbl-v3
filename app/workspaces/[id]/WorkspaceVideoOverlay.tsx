"use client";

import { FloatingMeetingVideo } from "./meetings/[meetingId]/video/FloatingMeetingVideo";
import { useActiveMeeting } from "@/components/ActiveMeetingContext";

export function WorkspaceVideoOverlay() {
  const { activeMeeting, setActiveMeeting } = useActiveMeeting();

  if (!activeMeeting) return null;

  return (
    <FloatingMeetingVideo
      key={activeMeeting.meetingId}
      workspaceId={activeMeeting.workspaceId}
      meetingId={activeMeeting.meetingId}
      videoHref={activeMeeting.videoHref}
      canRecord={activeMeeting.canRecord}
      recording={activeMeeting.recording}
      permissions={activeMeeting.permissions}
      raisedHandCount={activeMeeting.raisedHandCount}
      pendingRequestCount={activeMeeting.pendingRequestCount}
      onAfterLeave={() => setActiveMeeting(null)}
    />
  );
}
