export type MeetingLifecycleState =
  | "scheduled"
  | "starting-soon"
  | "joinable"
  | "live"
  | "ended"
  | "canceled";

type MeetingLifecycleInput = {
  startsAt: Date;
  endsAt?: Date | null;
  canceledAt?: Date | null;
};

const JOIN_WINDOW_MINUTES = 10;
const STARTING_SOON_MINUTES = 30;
const FALLBACK_DURATION_MINUTES = 60;

export function getMeetingEndAt(meeting: Pick<MeetingLifecycleInput, "startsAt" | "endsAt">) {
  return meeting.endsAt ?? new Date(meeting.startsAt.getTime() + FALLBACK_DURATION_MINUTES * 60 * 1000);
}

export function getMeetingLifecycle(
  meeting: MeetingLifecycleInput,
  now = new Date(),
): MeetingLifecycleState {
  if (meeting.canceledAt) {
    return "canceled";
  }

  const startsAtMs = meeting.startsAt.getTime();
  const endsAtMs = getMeetingEndAt(meeting).getTime();
  const nowMs = now.getTime();
  const joinOpensAtMs = startsAtMs - JOIN_WINDOW_MINUTES * 60 * 1000;
  const startingSoonAtMs = startsAtMs - STARTING_SOON_MINUTES * 60 * 1000;

  if (nowMs >= endsAtMs) {
    return "ended";
  }

  if (nowMs >= startsAtMs) {
    return "live";
  }

  if (nowMs >= joinOpensAtMs) {
    return "joinable";
  }

  if (nowMs >= startingSoonAtMs) {
    return "starting-soon";
  }

  return "scheduled";
}

export function canJoinMeeting(state: MeetingLifecycleState) {
  return state === "joinable" || state === "live";
}

export function canUseMeetingSession(state: MeetingLifecycleState) {
  return canJoinMeeting(state);
}

export function canChangeMeetingRsvp(state: MeetingLifecycleState) {
  return state === "scheduled" || state === "starting-soon" || state === "joinable";
}

export function canManageMeetingSchedule(state: MeetingLifecycleState) {
  return state === "scheduled" || state === "starting-soon" || state === "joinable";
}

export function canMutateMeetingArtifacts(state: MeetingLifecycleState) {
  return state !== "canceled" && state !== "ended";
}

export function canEditMeetingNotes(state: MeetingLifecycleState) {
  return state !== "canceled" && state !== "ended";
}

export function formatMeetingLifecycleLabel(state: MeetingLifecycleState) {
  switch (state) {
    case "starting-soon":
      return "Starting soon";
    case "joinable":
      return "Joinable";
    default:
      return state.charAt(0).toUpperCase() + state.slice(1);
  }
}
