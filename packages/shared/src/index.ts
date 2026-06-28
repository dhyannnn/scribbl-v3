export type WorkspaceType = "TEAM" | "PROJECT" | "CLASS";
export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";
export type SubscriptionPlan = "FREE" | "PRO" | "INSTITUTION" | "ENTERPRISE";
export type ChannelType = "CHAT" | "ANNOUNCEMENT" | "DIRECT";
export type NoteType = "TEXT" | "WHITEBOARD" | "MINDBOARD";
export type NoteVisibility = "PRIVATE" | "WORKSPACE_SHARED";
export type MeetingType = "GROUP" | "ONE_ON_ONE";
export type MeetingParticipantStatus = "INVITED" | "ACCEPTED" | "DECLINED";
export type NotificationType =
  | "ANNOUNCEMENT_POSTED"
  | "CHAT_MESSAGE"
  | "CALL_INCOMING"
  | "MEETING_SCHEDULED"
  | "MEETING_UPDATED"
  | "MEETING_CANCELED"
  | "FILE_SHARED"
  | "NOTE_SHARED"
  | "NOTE_MENTION";

export type MobileApiError = {
  error: string;
};

export type MobileUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  institution: string | null;
  jobTitle: string | null;
  bio: string | null;
};

export type MobileWorkspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  plan: SubscriptionPlan;
  description: string | null;
  role: WorkspaceRole;
  memberCount: number;
};

export type MobileWorkspaceMember = {
  id: string;
  role: WorkspaceRole;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  joinedAt: string;
};

export type MobileMeeting = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  title: string;
  description: string | null;
  type: MeetingType;
  startsAt: string;
  endsAt: string | null;
  canceledAt: string | null;
  participantStatus: MeetingParticipantStatus | null;
  canJoinVideo: boolean;
  webPath: string;
};

export type MobileMeetingVideoPermissions = {
  canUseMic: boolean;
  canUseCamera: boolean;
  canShareScreen: boolean;
  canSendReactions: boolean;
  canRaiseHand: boolean;
  canModerateVideo: boolean;
};

export type MobileMeetingVideoTokenResponse =
  | {
      roomName: string;
      serverUrl: string;
      token: string;
      permissions: MobileMeetingVideoPermissions;
      waiting?: false;
      conflict?: false;
    }
  | {
      waiting: true;
    }
  | {
      conflict: true;
      error: string;
    };

export type MobileMeetingVideoAttendance = "joined" | "left";

export type MobileMeetingVideoSessionRequest = {
  workspaceId: string;
  clientSessionId: string;
  attendance: MobileMeetingVideoAttendance;
};

export type MobileMeetingVideoSessionResponse = {
  ok: true;
};

export type MobileNoteSummary = {
  id: string;
  workspaceId: string | null;
  title: string;
  type: NoteType;
  visibility: NoteVisibility;
  updatedAt: string;
  ownerName: string;
  webPath: string;
};

export type MobileNoteDetail = MobileNoteSummary & {
  contentText: string;
  canEditInMobile: boolean;
};

export type MobileChannel = {
  id: string;
  workspaceId: string;
  name: string;
  type: ChannelType;
  updatedAt: string;
};

export type MobileChatMessage = {
  id: string;
  channelId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isPinned: boolean;
  sender: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type MobileNotification = {
  id: string;
  kind: "notification" | "workspace_invite";
  type: NotificationType;
  title: string;
  body: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
  workspaceName: string | null;
  actorName: string | null;
  role?: WorkspaceRole;
  expiresAt?: string;
};

export type MobileMeResponse = {
  user: MobileUser;
};

export type MobileWorkspacesResponse = {
  workspaces: MobileWorkspace[];
};

export type MobileWorkspaceMembersResponse = {
  members: MobileWorkspaceMember[];
};

export type MobileMeetingsResponse = {
  meetings: MobileMeeting[];
};

export type MobileNotesResponse = {
  notes: MobileNoteSummary[];
};

export type MobileNoteResponse = {
  note: MobileNoteDetail;
};

export type MobileChannelsResponse = {
  channels: MobileChannel[];
};

export type MobileMessagesResponse = {
  messages: MobileChatMessage[];
};

export type MobileMessageResponse = {
  message: MobileChatMessage;
};

export type MobileSendMessageRequest = {
  body: string;
};

export type MobileAcceptInviteResponse = {
  workspace: MobileWorkspace;
};

export type MobileNotificationsResponse = {
  unattendedCount: number;
  notifications: MobileNotification[];
};

export function workspaceWebPath(workspaceId: string) {
  return `/workspaces/${workspaceId}`;
}

export function noteWebPath(workspaceId: string | null, noteId: string) {
  return workspaceId ? `/workspaces/${workspaceId}/notes/${noteId}` : `/`;
}

export function meetingWebPath(workspaceId: string, meetingId: string) {
  return `/workspaces/${workspaceId}/meetings/${meetingId}`;
}

export function formatShortDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
