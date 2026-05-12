export type MeetingPermissionTargetType =
  | "SHARED_NOTES"
  | "WHITEBOARD"
  | "MICROPHONE"
  | "CAMERA"
  | "SCREEN_SHARE";

export type MeetingPermissionState = "ALLOWED" | "DENIED" | "REQUESTED";

export type MeetingModerationSettingsInput = {
  sharedNotesDefaultEdit: boolean;
  whiteboardDefaultEdit: boolean;
  micDefaultEnabled: boolean;
  cameraDefaultEnabled: boolean;
  screenShareDefaultEnabled: boolean;
  reactionsEnabled: boolean;
  handRaiseEnabled: boolean;
} | null;

export type MeetingPermissionOverrideInput = {
  userId: string;
  targetType: MeetingPermissionTargetType;
  artifactId: string | null;
  state: MeetingPermissionState;
};

export type MeetingRole = "OWNER" | "ADMIN" | "MEMBER" | "TUTOR" | "PROFESSOR";

export type MeetingPermissionContext = {
  currentUserId: string;
  meetingCreatedByUserId: string;
  currentUserRole?: MeetingRole | string | null;
  settings?: MeetingModerationSettingsInput;
  overrides?: MeetingPermissionOverrideInput[];
};

export type MeetingVideoPermissions = {
  canUseMic: boolean;
  canUseCamera: boolean;
  canShareScreen: boolean;
  canSendReactions: boolean;
  canRaiseHand: boolean;
  canModerateVideo: boolean;
};

export const defaultMeetingModerationSettings = {
  sharedNotesDefaultEdit: false,
  whiteboardDefaultEdit: false,
  micDefaultEnabled: true,
  cameraDefaultEnabled: true,
  screenShareDefaultEnabled: false,
  reactionsEnabled: true,
  handRaiseEnabled: true,
} satisfies NonNullable<MeetingModerationSettingsInput>;

export function canModerateMeeting(context: Pick<MeetingPermissionContext, "currentUserId" | "meetingCreatedByUserId" | "currentUserRole">) {
  return (
    context.currentUserId === context.meetingCreatedByUserId ||
    context.currentUserRole === "OWNER" ||
    context.currentUserRole === "ADMIN" ||
    context.currentUserRole === "TUTOR" ||
    context.currentUserRole === "PROFESSOR"
  );
}

export function canManageMeetingPermissions(context: Pick<MeetingPermissionContext, "currentUserId" | "meetingCreatedByUserId" | "currentUserRole">) {
  return canModerateMeeting(context);
}

export function canManageMeetingParticipantPermissions({
  currentUserId,
  currentUserRole,
  meetingCreatedByUserId,
  targetUserId,
  targetUserRole,
}: Pick<MeetingPermissionContext, "currentUserId" | "meetingCreatedByUserId" | "currentUserRole"> & {
  targetUserId: string;
  targetUserRole?: MeetingRole | string | null;
}) {
  if (currentUserId === targetUserId) {
    return false;
  }

  if (!canManageMeetingPermissions({ currentUserId, meetingCreatedByUserId, currentUserRole })) {
    return false;
  }

  return getMeetingModerationRank(currentUserId, meetingCreatedByUserId, currentUserRole) >
    getMeetingModerationRank(targetUserId, meetingCreatedByUserId, targetUserRole);
}

export function canEditMeetingSharedNote(context: MeetingPermissionContext & { artifactId?: string | null }) {
  return resolveMeetingArtifactPermission({
    ...context,
    targetType: "SHARED_NOTES",
    artifactId: context.artifactId ?? null,
  });
}

export function canEditMeetingWhiteboard(context: MeetingPermissionContext & { artifactId?: string | null }) {
  return resolveMeetingArtifactPermission({
    ...context,
    targetType: "WHITEBOARD",
    artifactId: context.artifactId ?? null,
  });
}

export function canUseMic(context: MeetingPermissionContext) {
  return resolveMeetingVideoPermission({ ...context, targetType: "MICROPHONE" });
}

export function canUseCamera(context: MeetingPermissionContext) {
  return resolveMeetingVideoPermission({ ...context, targetType: "CAMERA" });
}

export function canShareScreen(context: MeetingPermissionContext) {
  return resolveMeetingVideoPermission({ ...context, targetType: "SCREEN_SHARE" });
}

export function canSendReactions(context: MeetingPermissionContext) {
  return canModerateMeeting(context) || (context.settings ?? defaultMeetingModerationSettings).reactionsEnabled;
}

export function canRaiseHand(context: MeetingPermissionContext) {
  return canModerateMeeting(context) || (context.settings ?? defaultMeetingModerationSettings).handRaiseEnabled;
}

export function getMeetingVideoPermissions(context: MeetingPermissionContext): MeetingVideoPermissions {
  return {
    canUseMic: canUseMic(context),
    canUseCamera: canUseCamera(context),
    canShareScreen: canShareScreen(context),
    canSendReactions: canSendReactions(context),
    canRaiseHand: canRaiseHand(context),
    canModerateVideo: canModerateMeeting(context),
  };
}

export function resolveMeetingPermission({
  artifactId = null,
  currentUserId,
  meetingCreatedByUserId,
  currentUserRole,
  overrides = [],
  settings,
  targetType,
}: MeetingPermissionContext & {
  targetType: MeetingPermissionTargetType;
  artifactId?: string | null;
}) {
  if (canModerateMeeting({ currentUserId, meetingCreatedByUserId, currentUserRole })) {
    return true;
  }

  const userOverrides = overrides.filter(
    (override) => override.userId === currentUserId && override.targetType === targetType,
  );
  const artifactOverride = artifactId
    ? userOverrides.find((override) => override.artifactId === artifactId)
    : undefined;
  const meetingWideOverride = userOverrides.find((override) => override.artifactId === null);
  const override = artifactOverride ?? meetingWideOverride;

  if (override) {
    return override.state === "ALLOWED";
  }

  return getDefaultPermission(targetType, settings);
}

export function resolveMeetingVideoPermission({
  currentUserId,
  currentUserRole,
  overrides = [],
  settings,
  targetType,
}: MeetingPermissionContext & {
  targetType: "MICROPHONE" | "CAMERA" | "SCREEN_SHARE";
}) {
  if (currentUserRole === "OWNER") {
    return true;
  }

  const override = overrides.find(
    (item) => item.userId === currentUserId && item.targetType === targetType && item.artifactId === null,
  );

  if (override) {
    return override.state === "ALLOWED";
  }

  return getDefaultPermission(targetType, settings);
}

export function resolveMeetingArtifactPermission({
  artifactId = null,
  currentUserId,
  currentUserRole,
  overrides = [],
  settings,
  targetType,
}: MeetingPermissionContext & {
  targetType: "SHARED_NOTES" | "WHITEBOARD";
  artifactId?: string | null;
}) {
  if (currentUserRole === "OWNER") {
    return true;
  }

  const userOverrides = overrides.filter(
    (override) => override.userId === currentUserId && override.targetType === targetType,
  );
  const artifactOverride = artifactId
    ? userOverrides.find((override) => override.artifactId === artifactId)
    : undefined;
  const meetingWideOverride = userOverrides.find((override) => override.artifactId === null);
  const override = artifactOverride ?? meetingWideOverride;

  if (override) {
    return override.state === "ALLOWED";
  }

  return getDefaultPermission(targetType, settings);
}

export function getDefaultPermission(
  targetType: MeetingPermissionTargetType,
  settings: MeetingModerationSettingsInput | undefined,
) {
  const resolvedSettings = settings ?? defaultMeetingModerationSettings;

  switch (targetType) {
    case "SHARED_NOTES":
      return resolvedSettings.sharedNotesDefaultEdit;
    case "WHITEBOARD":
      return resolvedSettings.whiteboardDefaultEdit;
    case "MICROPHONE":
      return resolvedSettings.micDefaultEnabled;
    case "CAMERA":
      return resolvedSettings.cameraDefaultEnabled;
    case "SCREEN_SHARE":
      return resolvedSettings.screenShareDefaultEnabled;
  }
}

export function getArtifactPermissionTarget(noteType: "TEXT" | "WHITEBOARD") {
  return noteType === "WHITEBOARD" ? "WHITEBOARD" : "SHARED_NOTES";
}

function getMeetingModerationRank(
  userId: string,
  meetingCreatedByUserId: string,
  role?: MeetingRole | string | null,
) {
  switch (role) {
    case "OWNER":
      return 50;
    case "ADMIN":
      return 40;
    case "PROFESSOR":
    case "TUTOR":
      return 30;
    default:
      return userId === meetingCreatedByUserId ? 20 : 0;
  }
}
