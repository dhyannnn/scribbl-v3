"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MeetingVideoPermissionsProps, MeetingVideoRecordingProps } from "@/app/workspaces/[id]/meetings/[meetingId]/video/VideoPopoutShell";

export type ActiveMeetingData = {
  meetingId: string;
  workspaceId: string;
  videoHref: string;
  canRecord: boolean;
  recording: MeetingVideoRecordingProps;
  permissions: MeetingVideoPermissionsProps;
  raisedHandCount: number;
  pendingRequestCount: number;
};

type ActiveMeetingContextValue = {
  activeMeeting: ActiveMeetingData | null;
  setActiveMeeting: (data: ActiveMeetingData | null) => void;
  videoHidden: boolean;
  setVideoHidden: (hidden: boolean) => void;
};

const ActiveMeetingContext = createContext<ActiveMeetingContextValue>({
  activeMeeting: null,
  setActiveMeeting: () => {},
  videoHidden: false,
  setVideoHidden: () => {},
});

export function ActiveMeetingProvider({ children }: { children: ReactNode }) {
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeetingData | null>(null);
  const [videoHidden, setVideoHidden] = useState(false);
  return (
    <ActiveMeetingContext.Provider value={{ activeMeeting, setActiveMeeting, videoHidden, setVideoHidden }}>
      {children}
    </ActiveMeetingContext.Provider>
  );
}

export function useActiveMeeting() {
  return useContext(ActiveMeetingContext);
}
