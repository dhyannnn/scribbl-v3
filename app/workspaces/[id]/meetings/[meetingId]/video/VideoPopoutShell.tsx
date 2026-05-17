"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PermissionSubmitButton } from "@/components/PermissionSubmitButton";
import { RealtimeChatPanel, type RealtimeChatChannel } from "@/components/RealtimeChatPanel";
import { setMeetingPermissionOverride } from "@/app/workspaces/[id]/meetings/[meetingId]/actions";
import { hasRecentActiveVideoSession, MeetingVideoRoom } from "./MeetingVideoRoom";

type VideoPopoutShellProps = {
  workspaceId: string;
  meetingId: string;
  meetingTitle: string;
  workspaceName: string;
  lifecycleLabel: string;
  hubHref: string;
  canRecord?: boolean;
  disabled: boolean;
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
      channel.close();
    };
  }, [channelName, closeToHub, meetingId, router]);

  return (
    <main className="min-h-screen bg-[#171713] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => closeToHub()}
              className="text-sm font-medium text-[#b7c8ba] transition hover:text-white"
            >
              {wasOpenedByHub ? "Bring video back" : "Back to meeting hub"}
            </button>
            <p className="mt-5 text-sm font-medium uppercase tracking-[0.18em] text-[#b7c8ba]">
              {workspaceName} / {lifecycleLabel}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal">{meetingTitle}</h1>
          </div>
          {!wasOpenedByHub ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href={`${hubHref}#meeting-notes`}
                className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
              >
                Open Notes
              </Link>
              <Link
                href={`${hubHref}#meeting-chat`}
                className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
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
          <p className="rounded-md border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80">
            {recordingStatusMessage}
          </p>
        ) : null}

        {isReturning ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-6 text-center">
            <p className="text-sm font-medium text-white/70">Returning video to the meeting hub...</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
            <div className="min-w-0">
              <VideoRoomStatusStrip
                recording={recording}
                participants={participants}
                accessRequestCount={accessRequests.length}
              />
              <MeetingVideoRoom
                workspaceId={workspaceId}
                meetingId={meetingId}
                autoJoin={shouldAutoJoin}
                disabled={disabled}
                recording={recording}
                canRecord={canRecord}
                permissions={permissions}
              />
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
}: {
  accessRequestCount: number;
  participants: VideoMeetingParticipant[];
  recording: MeetingVideoRecordingProps;
}) {
  const activeParticipantCount = participants.filter((participant) => participant.joinedAt && !participant.leftAt).length;
  const handRaisedCount = participants.filter((participant) => participant.handRaised).length;
  const activeRecording = recording.activeRecording;

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
      ? "border-[#5f7f67] bg-[#233526] text-[#dff4e5]"
      : tone === "warn"
        ? "border-[#9a7c39] bg-[#372d18] text-[#ffe8ad]"
        : "border-white/10 bg-white/10 text-white/80";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClassName}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
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
  workspaceId: string;
}) {
  const activeParticipantCount = participants.filter((participant) => participant.joinedAt && !participant.leftAt).length;
  const tabButtonClassName = (tab: VideoPanelTab) =>
    activeTab === tab
      ? "min-h-10 rounded-md bg-white px-3 text-sm font-semibold text-[#20201d] shadow-sm"
      : "min-h-10 rounded-md px-3 text-sm font-semibold text-white/65 transition hover:bg-white/10 hover:text-white";

  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-[#20201d]">
      <div className="border-b border-white/10 p-2">
        <div className="grid grid-cols-3 gap-1 rounded-md bg-[#171713] p-1">
          <button type="button" onClick={() => onTabChange("chat")} className={tabButtonClassName("chat")}>
            Chat
          </button>
          <button type="button" onClick={() => onTabChange("people")} className={tabButtonClassName("people")}>
            People
            {accessRequests.length > 0 ? (
              <span className="ml-1 rounded-full bg-[#fff7df] px-1.5 py-0.5 text-[10px] font-bold text-[#7a5a15]">
                {accessRequests.length}
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
    <section className="rounded-md border border-white/10 bg-[#20201d] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b7c8ba]">Recording</p>
          <h2 className="mt-1 text-base font-semibold text-white">{getRecordingLabel(latestRecording?.status)}</h2>
        </div>
        {recording.activeRecording ? (
          <span className="rounded-md bg-[#dff4e5] px-2 py-1 text-xs font-semibold text-[#1d6a3b]">Live</span>
        ) : null}
      </div>
      {latestRecording ? (
        <p className="mt-3 text-sm leading-6 text-white/70">
          Started by {latestRecording.startedBy.displayName} / {formatShortDateTime(latestRecording.startedAt)}
          {latestRecording.file?.sizeBytes ? ` / ${formatFileSize(latestRecording.file.sizeBytes)}` : ""}
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-white/65">No recording has been saved for this meeting yet.</p>
      )}
      {latestRecording?.file ? (
        <Link
          href={`/api/files/${latestRecording.file.id}`}
          target="_blank"
          className="mt-3 inline-flex min-h-9 items-center rounded-md border border-white/15 bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Open recording
        </Link>
      ) : null}
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
    <section className="rounded-md border border-[#9a7c39] bg-[#372d18] p-4 text-[#ffe8ad]">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]">Edit access</p>
      <h2 className="mt-1 text-base font-semibold text-white">
        {accessRequests.length} pending {accessRequests.length === 1 ? "request" : "requests"}
      </h2>
      <div className="mt-3 grid gap-2">
        {accessRequests.map((request) => (
          <div
            key={request.id}
            className="grid gap-2 rounded-md border border-[#80672f] bg-[#2a2317] px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{request.user.displayName}</p>
              <p className="truncate text-xs text-[#ffe8ad]/80">
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
    <section className="rounded-md border border-white/10 bg-[#20201d] p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b7c8ba]">Participants</p>
          <h2 className="mt-1 text-base font-semibold text-white">
            {activeParticipants.length} in session
          </h2>
        </div>
        <p className="text-sm text-white/60">{participants.length} total</p>
      </div>
      <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-white/10">
        {sortedParticipants.map((participant) => (
          <div
            key={participant.id}
            className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 last:border-b-0"
          >
            <ParticipantAvatar participant={participant} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{participant.user.displayName}</p>
              <p className="truncate text-xs text-white/55">{formatParticipantStatus(participant)}</p>
            </div>
            {participant.handRaised ? (
              <span className="rounded-md bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#7a5a15]">
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
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dfe9df] text-sm font-semibold text-[#2f604b]">
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
    <section className="rounded-md border border-white/10 bg-[#20201d] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b7c8ba]">Meeting</p>
      <p className="mt-2 text-sm leading-6 text-white/70">
        {formatShortDateTime(context.startsAt)}
        {context.endsAt ? ` to ${formatTime(context.endsAt)}` : ""}
      </p>
      {context.description ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/70">{context.description}</p>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Artifacts</h2>
        <button
          type="button"
          onClick={onReturnToHub}
          className="text-sm font-medium text-[#b7c8ba] transition hover:text-white"
        >
          View hub
        </button>
      </div>
      {context.artifacts.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {context.artifacts.slice(0, 5).map((artifact) => (
            <div key={artifact.id} className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{artifact.title}</p>
                  <p className="mt-1 truncate text-xs text-white/55">
                    {formatArtifactType(artifact)} / {artifact.detail}
                  </p>
                </div>
                {artifact.fileId ? (
                  <Link
                    href={`/api/files/${artifact.fileId}`}
                    target="_blank"
                    className="shrink-0 text-xs font-semibold text-[#b7c8ba] hover:text-white"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-white/10 px-3 py-2 text-sm text-white/55">
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
