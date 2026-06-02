"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionSubmitButton } from "@/components/PermissionSubmitButton";
import { RealtimeChatPanel, type RealtimeChatChannel } from "@/components/RealtimeChatPanel";
import { admitAllToMeeting, admitToMeeting, setMeetingPermissionOverride } from "@/app/workspaces/[id]/meetings/[meetingId]/actions";
import { hasRecentActiveVideoSession, MeetingVideoRoom } from "./MeetingVideoRoom";

type WaitingUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  requestedAt: string;
};

type VideoPopoutShellProps = {
  workspaceId: string;
  meetingId: string;
  meetingTitle: string;
  workspaceName: string;
  lifecycleLabel: string;
  hubHref: string;
  canRecord?: boolean;
  disabled: boolean;
  waitingRoom: boolean;
  canModerate: boolean;
  recording: MeetingVideoRecordingProps;
  recordingStatusMessage: string | null;
  permissions: MeetingVideoPermissionsProps;
  participants: VideoMeetingParticipant[];
  accessRequests: VideoMeetingAccessRequest[];
  context: VideoMeetingContextProps;
  chat: VideoMeetingChatProps;
};

export type MeetingVideoRecording = {
  id: string;
  status: string;
  startedAt: Date;
  stoppedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  startedBy: {
    displayName: string;
  };
  stoppedBy: {
    displayName: string;
  } | null;
  file: {
    id: string;
    name: string;
    sizeBytes: number | null;
  } | null;
};

export type MeetingVideoRecordingProps = {
  activeRecording?: MeetingVideoRecording;
  canManage: boolean;
  latestRecording?: MeetingVideoRecording;
};

export type MeetingVideoPermissionsProps = {
  canUseMic: boolean;
  canUseCamera: boolean;
  canShareScreen: boolean;
  canSendReactions: boolean;
  canRaiseHand: boolean;
  canModerateVideo: boolean;
  handRaised: boolean;
};

type VideoMeetingChatProps = {
  roomId: string;
  channel: RealtimeChatChannel;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserAvatarUrl: string | null;
  canModerateChat: boolean;
  openInChannelsHref?: string;
  initialPolls?: import("@/lib/polls").PollData[];
  canCreatePolls?: boolean;
};

type VideoMeetingParticipant = {
  id: string;
  userId: string;
  status: string;
  joinedAt: string | null;
  leftAt: string | null;
  handRaised: boolean;
  user: {
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
};

type MeetingPermissionTargetType = "SHARED_NOTES" | "WHITEBOARD" | "MICROPHONE" | "CAMERA" | "SCREEN_SHARE";

type VideoMeetingAccessRequest = {
  id: string;
  userId: string;
  targetType: MeetingPermissionTargetType;
  artifactId: string | null;
  user: {
    displayName: string;
    email: string;
  };
  artifactTitle: string | null;
};

type VideoMeetingArtifact = {
  id: string;
  type: string;
  source: string;
  createdAt: string;
  title: string;
  detail: string;
  fileId: string | null;
  fileSizeBytes: number | null;
  noteType: string | null;
};

type VideoMeetingContextProps = {
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  artifacts: VideoMeetingArtifact[];
};

type VideoPanelTab = "chat" | "people" | "meeting";

type VideoChannelMessage =
  | { type: "hub-ready" }
  | { type: "popout-ready" }
  | { type: "popout-closed" }
  | { type: "bring-back" }
  | { type: "navigate-hub-to"; href: string }
  | { type: "focus-hub"; hash: string }
  | { type: "permissions-updated" };

export function VideoPopoutShell({
  workspaceId,
  meetingId,
  meetingTitle,
  workspaceName,
  lifecycleLabel,
  hubHref,
  canRecord = true,
  disabled,
  waitingRoom,
  canModerate,
  permissions,
  recording,
  recordingStatusMessage,
  participants,
  accessRequests,
  context,
  chat,
}: VideoPopoutShellProps) {
  const router = useRouter();
  const [isReturning, setIsReturning] = useState(false);
  const [waitingUsers, setWaitingUsers] = useState<WaitingUser[]>([]);
  const waitingPollRef = useRef<number | null>(null);
  const [wasOpenedByHub, setWasOpenedByHub] = useState(false);
  const [shouldAutoJoin, setShouldAutoJoin] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<VideoPanelTab>("chat");
  const wasOpenedByHubRef = useRef(false);
  const channelName = useMemo(() => `scribbl-video-${meetingId}`, [meetingId]);

  const closeToHub = useCallback(
    (channel?: BroadcastChannel, openedByHub = wasOpenedByHubRef.current) => {
      const activeChannel = channel ?? new BroadcastChannel(channelName);
      activeChannel.postMessage({ type: "bring-back" } satisfies VideoChannelMessage);
      setIsReturning(true);

      if (openedByHub) {
        window.opener?.focus();
        window.setTimeout(() => {
          window.close();
          activeChannel.close();
        }, 150);
        return;
      }

      activeChannel.close();
      router.push(hubHref);
    },
    [channelName, hubHref, router],
  );

  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    const openedByHub = Boolean(window.opener);

    wasOpenedByHubRef.current = openedByHub;
    window.setTimeout(() => setWasOpenedByHub(openedByHub), 0);
    window.setTimeout(() => {
      setShouldAutoJoin(openedByHub && hasRecentActiveVideoSession(meetingId));
    }, 0);

    if (openedByHub) {
      channel.postMessage({ type: "popout-ready" } satisfies VideoChannelMessage);
    }

    channel.onmessage = (event: MessageEvent<VideoChannelMessage>) => {
      if (event.data.type === "hub-ready" && openedByHub) {
        channel.postMessage({ type: "popout-ready" } satisfies VideoChannelMessage);
      }

      if (event.data.type === "bring-back" && openedByHub) {
        closeToHub(channel, openedByHub);
      }

      if (event.data.type === "permissions-updated") {
        router.refresh();
      }
    };

    function announceClosed() {
      channel.postMessage({ type: "popout-closed" } satisfies VideoChannelMessage);
    }

    window.addEventListener("beforeunload", announceClosed);

    return () => {
      window.removeEventListener("beforeunload", announceClosed);
      // Also fires on SPA unmount (sidebar navigation) — beforeunload only covers actual tab close
      channel.postMessage({ type: "popout-closed" } satisfies VideoChannelMessage);
      channel.close();
    };
  }, [channelName, closeToHub, meetingId, router]);

  // Intercept SPA navigation in the popout tab before the component unmounts.
  // pushState fires synchronously inside Next.js Router before any re-render,
  // so this is reliable even when the target component would unmount immediately.
  const videoPath = `/workspaces/${workspaceId}/meetings/${meetingId}/video`;
  useEffect(() => {
    if (!window.opener) return;
    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function (state, title, url) {
      if (url && String(url) !== videoPath) {
        const ch = new BroadcastChannel(channelName);
        ch.postMessage({ type: "navigate-hub-to", href: String(url) } satisfies VideoChannelMessage);
        ch.close();
        window.opener?.focus();
        window.setTimeout(() => window.close(), 50);
        return;
      }
      return originalPushState(state, title, url);
    };
    return () => {
      window.history.pushState = originalPushState;
    };
  }, [channelName, videoPath]);

  useEffect(() => {
    if (!canModerate || !waitingRoom) return;

    async function pollWaiting() {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/waiting-room`);
        if (res.ok) {
          const data = await res.json() as { waitingUsers: WaitingUser[] };
          setWaitingUsers(data.waitingUsers);
        }
      } catch { /* network error, ignore */ }
    }

    void pollWaiting();
    waitingPollRef.current = window.setInterval(() => { void pollWaiting(); }, 5000);

    return () => {
      if (waitingPollRef.current !== null) {
        clearInterval(waitingPollRef.current);
        waitingPollRef.current = null;
      }
    };
  }, [canModerate, waitingRoom, meetingId]);

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => closeToHub()}
              className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] transition hover:text-[var(--color-text)]"
            >
              ← {wasOpenedByHub ? "Bring video back" : "Back to meeting hub"}
            </button>
            <p className="mt-4 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              {workspaceName} / {lifecycleLabel}
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-semibold text-[var(--color-text)]">{meetingTitle}</h1>
          </div>
          {!wasOpenedByHub ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href={`${hubHref}#meeting-notes`}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Open Notes
              </Link>
              <Link
                href={`${hubHref}#meeting-chat`}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
              >
                Open Chat
              </Link>
            </div>
          ) : null}
        </header>

        {disabled ? (
          <p className="rounded-md border border-[#ead1cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#7a3434]">
            Video opens 10 minutes before the scheduled start and closes when the meeting ends or is canceled.
          </p>
        ) : null}

        {recordingStatusMessage ? (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
            {recordingStatusMessage}
          </p>
        ) : null}

        {isReturning ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--color-muted)]">Returning video to the meeting hub…</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* Video section — fills most of the viewport */}
            <div className="flex min-h-0 flex-col" style={{ minHeight: "calc(100vh - 200px)" }}>
              <VideoRoomStatusStrip
                recording={recording}
                participants={participants}
                accessRequestCount={accessRequests.length}
                waitingCount={canModerate ? waitingUsers.length : 0}
              />
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
                <MeetingVideoRoom
                  workspaceId={workspaceId}
                  meetingId={meetingId}
                  autoJoin={shouldAutoJoin}
                  disabled={disabled}
                  recording={recording}
                  canRecord={canRecord}
                  permissions={permissions}
                  onAfterLeave={() => closeToHub()}
                  raisedHandCount={participants.filter((p) => p.handRaised).length}
                  accessRequestCount={accessRequests.length}
                  waitingCount={canModerate ? waitingUsers.length : undefined}
                />
              </div>
            </div>
            <aside className="min-w-0 xl:sticky xl:top-5">
              <FullVideoSidePanel
                activeTab={activePanelTab}
                onTabChange={setActivePanelTab}
                workspaceId={workspaceId}
                meetingId={meetingId}
                onReturnToHub={() => closeToHub()}
                chat={chat}
                recording={recording}
                participants={participants}
                accessRequests={accessRequests}
                waitingUsers={waitingUsers}
                canModerate={canModerate}
                context={context}
              />
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}

function VideoRoomStatusStrip({
  accessRequestCount,
  participants,
  recording,
  waitingCount = 0,
}: {
  accessRequestCount: number;
  participants: VideoMeetingParticipant[];
  recording: MeetingVideoRecordingProps;
  waitingCount?: number;
}) {
  const activeParticipantCount = participants.filter((participant) => participant.joinedAt && !participant.leftAt).length;
  const handRaisedCount = participants.filter((participant) => participant.handRaised).length;
  const activeRecording = recording.activeRecording;

  return (
    <div className={`mb-4 grid gap-2 sm:grid-cols-2 ${waitingCount > 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
      <StatusPill label="Participants" value={`${activeParticipantCount}/${participants.length} in session`} />
      <StatusPill label="Hands" value={handRaisedCount > 0 ? `${handRaisedCount} raised` : "None raised"} />
      <StatusPill
        label="Recording"
        value={activeRecording ? getRecordingLabel(activeRecording.status) : getRecordingLabel(recording.latestRecording?.status)}
        tone={activeRecording ? "live" : "neutral"}
      />
      <StatusPill
        label="Requests"
        value={accessRequestCount > 0 ? `${accessRequestCount} pending` : "None pending"}
        tone={accessRequestCount > 0 ? "warn" : "neutral"}
      />
      {waitingCount > 0 ? (
        <StatusPill label="Waiting" value={`${waitingCount} waiting`} tone="warn" />
      ) : null}
    </div>
  );
}

function StatusPill({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "live" | "warn";
  value: string;
}) {
  const toneClassName =
    tone === "live"
      ? "border-[var(--color-success-dim)] bg-[var(--color-success-dim)] text-[var(--color-success)]"
      : tone === "warn"
        ? "border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] text-[var(--color-warning)]"
        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClassName}`}>
      <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-subtle)]">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function FullVideoSidePanel({
  activeTab,
  accessRequests,
  chat,
  context,
  meetingId,
  onTabChange,
  onReturnToHub,
  participants,
  recording,
  waitingUsers,
  canModerate,
  workspaceId,
}: {
  activeTab: VideoPanelTab;
  accessRequests: VideoMeetingAccessRequest[];
  chat: VideoMeetingChatProps;
  context: VideoMeetingContextProps;
  meetingId: string;
  onTabChange: (tab: VideoPanelTab) => void;
  onReturnToHub: () => void;
  participants: VideoMeetingParticipant[];
  recording: MeetingVideoRecordingProps;
  waitingUsers: WaitingUser[];
  canModerate: boolean;
  workspaceId: string;
}) {
  const activeParticipantCount = participants.filter((participant) => participant.joinedAt && !participant.leftAt).length;
  const tabButtonClassName = (tab: VideoPanelTab) =>
    activeTab === tab
      ? "min-h-9 rounded-full bg-[var(--color-primary)] px-3 text-sm font-semibold text-white shadow-sm"
      : "min-h-9 rounded-full px-3 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)]";

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] p-2">
        <div className="flex gap-1 rounded-full bg-[var(--color-surface-low)] p-1">
          <button type="button" onClick={() => onTabChange("chat")} className={tabButtonClassName("chat")}>
            Chat
          </button>
          <button type="button" onClick={() => onTabChange("people")} className={tabButtonClassName("people")}>
            People
            {(accessRequests.length + waitingUsers.length) > 0 ? (
              <span className="ml-1 rounded-full bg-[var(--color-warning-dim)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                {accessRequests.length + waitingUsers.length}
              </span>
            ) : null}
          </button>
          <button type="button" onClick={() => onTabChange("meeting")} className={tabButtonClassName("meeting")}>
            Meeting
          </button>
        </div>
      </div>

      <div className={activeTab === "chat" ? "block" : "hidden"} aria-hidden={activeTab !== "chat"}>
        <RealtimeChatPanel
          workspaceId={workspaceId}
          roomId={chat.roomId}
          channel={chat.channel}
          currentUserId={chat.currentUserId}
          currentUserDisplayName={chat.currentUserDisplayName}
          currentUserAvatarUrl={chat.currentUserAvatarUrl}
          canModerateChat={chat.canModerateChat}
          initialPolls={chat.initialPolls}
          canCreatePolls={chat.canCreatePolls}
          title="Meeting Chat"
          emptyText="No messages in this meeting chat yet."
          placeholder="Message this meeting"
          openInChannelsHref={chat.openInChannelsHref}
          maxMessagesHeightClassName="max-h-[520px] min-h-[320px]"
        />
      </div>

      <div className={activeTab === "people" ? "grid gap-4 p-4" : "hidden"} aria-hidden={activeTab !== "people"}>
        <div className="grid grid-cols-2 gap-2">
          <StatusPill label="In session" value={`${activeParticipantCount}/${participants.length}`} />
          <StatusPill
            label="Requests"
            value={accessRequests.length > 0 ? `${accessRequests.length} pending` : "None"}
            tone={accessRequests.length > 0 ? "warn" : "neutral"}
          />
        </div>
        {canModerate && waitingUsers.length > 0 ? (
          <WaitingRoomMiniPanel
            workspaceId={workspaceId}
            meetingId={meetingId}
            waitingUsers={waitingUsers}
          />
        ) : null}
        {accessRequests.length > 0 ? (
          <AccessRequestsMiniPanel
            workspaceId={workspaceId}
            meetingId={meetingId}
            accessRequests={accessRequests}
          />
        ) : null}
        <ParticipantsMiniPanel participants={participants} />
      </div>

      <div className={activeTab === "meeting" ? "grid gap-4 p-4" : "hidden"} aria-hidden={activeTab !== "meeting"}>
        <RecordingMiniPanel recording={recording} />
        <MeetingContextMiniPanel context={context} onReturnToHub={onReturnToHub} />
      </div>
    </section>
  );
}

function RecordingMiniPanel({ recording }: { recording: MeetingVideoRecordingProps }) {
  const latestRecording = recording.activeRecording ?? recording.latestRecording;

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-subtle)]">Recording</p>
          <h2 className="mt-1 text-base font-semibold text-[var(--color-text)]">{getRecordingLabel(latestRecording?.status)}</h2>
        </div>
        {recording.activeRecording ? (
          <span className="rounded-md bg-[var(--color-success-dim)] px-2 py-1 text-xs font-semibold text-[var(--color-success)]">Live</span>
        ) : null}
      </div>
      {latestRecording ? (
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
          Started by {latestRecording.startedBy.displayName} / {formatShortDateTime(latestRecording.startedAt)}
          {latestRecording.file?.sizeBytes ? ` / ${formatFileSize(latestRecording.file.sizeBytes)}` : ""}
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">No recording has been saved for this meeting yet.</p>
      )}
      {latestRecording?.file ? (
        <Link
          href={`/api/files/${latestRecording.file.id}`}
          target="_blank"
          className="mt-3 inline-flex min-h-9 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
        >
          Open recording
        </Link>
      ) : null}
    </section>
  );
}

function WaitingRoomMiniPanel({
  meetingId,
  waitingUsers,
  workspaceId,
}: {
  meetingId: string;
  waitingUsers: WaitingUser[];
  workspaceId: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] p-4 text-[var(--color-warning)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]">Waiting room</p>
      <h2 className="mt-1 text-base font-semibold text-[var(--color-text)]">
        {waitingUsers.length} {waitingUsers.length === 1 ? "person" : "people"} waiting
      </h2>
      <div className="mt-3 grid gap-2">
        {waitingUsers.map((user) => (
          <div
            key={user.userId}
            className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2.5"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-xs font-semibold text-[var(--color-secondary)]">
                {getInitials(user.displayName)}
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)]">{user.displayName}</p>
            <form action={admitToMeeting} className="shrink-0">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="meetingId" value={meetingId} />
              <input type="hidden" name="userId" value={user.userId} />
              <button
                type="submit"
                className="min-h-7 rounded-md border border-[#83a88b] bg-[#dff4e5] px-2.5 text-xs font-semibold text-[#1d6a3b] transition hover:bg-[#cbead4]"
              >
                Admit
              </button>
            </form>
          </div>
        ))}
      </div>
      <form action={admitAllToMeeting} className="mt-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="meetingId" value={meetingId} />
        <button
          type="submit"
          className="min-h-9 w-full rounded-md border border-[#83a88b] bg-[#dff4e5] px-3 text-sm font-semibold text-[#1d6a3b] transition hover:bg-[#cbead4]"
        >
          Admit all
        </button>
      </form>
    </section>
  );
}

function AccessRequestsMiniPanel({
  accessRequests,
  meetingId,
  workspaceId,
}: {
  accessRequests: VideoMeetingAccessRequest[];
  meetingId: string;
  workspaceId: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-warning-dim)] bg-[var(--color-warning-dim)] p-4 text-[var(--color-warning)]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]">Edit access</p>
      <h2 className="mt-1 text-base font-semibold text-[var(--color-text)]">
        {accessRequests.length} pending {accessRequests.length === 1 ? "request" : "requests"}
      </h2>
      <div className="mt-3 grid gap-2">
        {accessRequests.map((request) => (
          <div
            key={request.id}
            className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text)]">{request.user.displayName}</p>
              <p className="truncate text-xs text-[var(--color-warning)]">
                {getPermissionTargetLabel(request.targetType)}
                {request.artifactTitle ? ` / ${request.artifactTitle}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PermissionOverrideButton
                workspaceId={workspaceId}
                meetingId={meetingId}
                userId={request.userId}
                targetType={request.targetType}
                state="ALLOWED"
                artifactId={request.artifactId ?? undefined}
                label="Allow"
                variant="primary"
              />
              <PermissionOverrideButton
                workspaceId={workspaceId}
                meetingId={meetingId}
                userId={request.userId}
                targetType={request.targetType}
                state="DENIED"
                artifactId={request.artifactId ?? undefined}
                label="Deny"
                variant="danger"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ParticipantsMiniPanel({ participants }: { participants: VideoMeetingParticipant[] }) {
  const activeParticipants = participants.filter((participant) => participant.joinedAt && !participant.leftAt);
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    const aActive = Boolean(a.joinedAt && !a.leftAt);
    const bActive = Boolean(b.joinedAt && !b.leftAt);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.user.displayName.localeCompare(b.user.displayName);
  });

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-subtle)]">Participants</p>
          <h2 className="mt-1 text-base font-semibold text-[var(--color-text)]">
            {activeParticipants.length} in session
          </h2>
        </div>
        <p className="text-sm text-[var(--color-subtle)]">{participants.length} total</p>
      </div>
      <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border)]">
        {sortedParticipants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-3 border-b border-[var(--color-border)] px-3 py-2.5 last:border-b-0"
          >
            <ParticipantAvatar participant={participant} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--color-text)]">{participant.user.displayName}</p>
              <p className="truncate text-xs text-[var(--color-subtle)]">{formatParticipantStatus(participant)}</p>
            </div>
            {participant.handRaised ? (
              <span className="rounded-md bg-[var(--color-warning-dim)] px-2 py-1 text-xs font-semibold text-[var(--color-warning)]">
                Hand
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ParticipantAvatar({ participant }: { participant: VideoMeetingParticipant }) {
  if (participant.user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={participant.user.avatarUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-sm font-semibold text-[var(--color-secondary)]">
      {getInitials(participant.user.displayName)}
    </div>
  );
}

function MeetingContextMiniPanel({
  context,
  onReturnToHub,
}: {
  context: VideoMeetingContextProps;
  onReturnToHub: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-subtle)]">Meeting</p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
        {formatShortDateTime(context.startsAt)}
        {context.endsAt ? ` to ${formatTime(context.endsAt)}` : ""}
      </p>
      {context.description ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--color-muted)]">{context.description}</p>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Artifacts</h2>
        <button
          type="button"
          onClick={onReturnToHub}
          className="text-sm font-medium text-[var(--color-subtle)] transition hover:text-[var(--color-text)]"
        >
          View hub
        </button>
      </div>
      {context.artifacts.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {context.artifacts.slice(0, 5).map((artifact) => (
            <div key={artifact.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2.5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{artifact.title}</p>
                  <p className="mt-1 truncate text-xs text-[var(--color-subtle)]">
                    {formatArtifactType(artifact)} / {artifact.detail}
                  </p>
                </div>
                {artifact.fileId ? (
                  <Link
                    href={`/api/files/${artifact.fileId}`}
                    target="_blank"
                    className="shrink-0 text-xs font-semibold text-[var(--color-subtle)] hover:text-[var(--color-text)]"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-subtle)]">
          Notes, whiteboards, files, and recordings saved from this meeting will appear here.
        </p>
      )}
    </section>
  );
}

function PermissionOverrideButton({
  artifactId,
  label,
  meetingId,
  state,
  targetType,
  userId,
  variant,
  workspaceId,
}: {
  artifactId?: string;
  label: string;
  meetingId: string;
  state: "ALLOWED" | "DENIED";
  targetType: MeetingPermissionTargetType;
  userId: string;
  variant: "danger" | "primary";
  workspaceId: string;
}) {
  return (
    <form action={setMeetingPermissionOverride}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="state" value={state} />
      {artifactId ? <input type="hidden" name="artifactId" value={artifactId} /> : null}
      <PermissionSubmitButton
        meetingId={meetingId}
        targetType={targetType}
        pendingLabel="Saving..."
        className={getPermissionButtonClassName(variant)}
      >
        {label}
      </PermissionSubmitButton>
    </form>
  );
}

function getPermissionButtonClassName(variant: "danger" | "primary") {
  if (variant === "danger") {
    return "min-h-9 w-full rounded-md border border-[#c78578] bg-transparent px-3 text-xs font-semibold text-[#ffd0c9] transition hover:bg-[#5a2720] disabled:cursor-not-allowed disabled:opacity-60";
  }

  return "min-h-9 w-full rounded-md border border-[#83a88b] bg-[#dff4e5] px-3 text-xs font-semibold text-[#1d6a3b] transition hover:bg-[#cbead4] disabled:cursor-not-allowed disabled:opacity-60";
}

function getPermissionTargetLabel(targetType: MeetingPermissionTargetType) {
  switch (targetType) {
    case "SHARED_NOTES":
      return "Shared note writing";
    case "WHITEBOARD":
      return "Board drawing";
    case "MICROPHONE":
      return "Microphone";
    case "CAMERA":
      return "Camera";
    case "SCREEN_SHARE":
      return "Screen share";
  }
}

function getRecordingLabel(status?: string) {
  switch (status) {
    case "STARTING":
      return "Starting";
    case "ACTIVE":
      return "Recording live";
    case "STOPPING":
      return "Finalizing";
    case "COMPLETED":
      return "Recording saved";
    case "FAILED":
      return "Recording failed";
    default:
      return "Not recording";
  }
}

function formatParticipantStatus(participant: VideoMeetingParticipant) {
  if (participant.joinedAt && !participant.leftAt) {
    return "In session";
  }

  if (participant.joinedAt) {
    return `Attended ${formatShortDateTime(participant.joinedAt)}`;
  }

  return participant.status.toLowerCase();
}

function formatArtifactType(artifact: VideoMeetingArtifact) {
  if (artifact.type === "NOTE" && artifact.noteType === "TEXT") {
    return "Text note";
  }

  if (artifact.type === "WHITEBOARD" || artifact.noteType === "WHITEBOARD") {
    return "Whiteboard";
  }

  return artifact.type.toLowerCase();
}

function formatShortDateTime(value: Date | string) {
  const date = new Date(value);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    date.getMonth()
  ];

  return `${month} ${date.getDate()} at ${formatClockTime(date)}`;
}

function formatTime(value: string) {
  return formatClockTime(new Date(value));
}

function formatClockTime(date: Date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutes} ${period}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
