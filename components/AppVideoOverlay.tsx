"use client";

import { FloatingMeetingVideo } from "@/app/workspaces/[id]/meetings/[meetingId]/video/FloatingMeetingVideo";
import { useActiveMeeting } from "@/components/ActiveMeetingContext";

export function AppVideoOverlay() {
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
      onDismiss={() => setActiveMeeting(null)}
    />
  );
}
