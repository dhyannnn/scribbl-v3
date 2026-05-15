import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MeetingNotesSection,
  type NoteArtifactData,
  type PendingMeetingPermissionRequest,
} from "@/components/MeetingNotesSection";
import { MeetingRouteRefresher } from "@/components/MeetingRouteRefresher";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { PermissionSubmitButton } from "@/components/PermissionSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { createChatRoomId } from "@/lib/liveblocks-room";
import {
  canChangeMeetingRsvp,
  canEditMeetingNotes,
  canJoinMeeting,
  canManageMeetingSchedule,
  canMutateMeetingArtifacts,
  formatMeetingLifecycleLabel,
  getMeetingEndAt,
  getMeetingLifecycle,
  type MeetingLifecycleState,
} from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";
import {
  canEditMeetingSharedNote,
  canEditMeetingWhiteboard,
  canManageMeetingParticipantPermissions,
  getDefaultPermission,
  getMeetingVideoPermissions,
  type MeetingPermissionOverrideInput,
  type MeetingPermissionTargetType,
} from "@/lib/meeting-permissions";
import { CancelMeetingForm } from "../CancelMeetingForm";
import { updateMeetingDetails } from "../actions";
import { MeetingChatPanel } from "./MeetingChatPanel";
import { FloatingMeetingVideo } from "./video/FloatingMeetingVideo";
import {
  attachFileToMeeting,
  attachNoteToMeeting,
  lowerParticipantHand,
  setMeetingPermissionOverride,
  updateCurrentUserParticipantStatus,
} from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
    meetingId: string;
  }>;
  searchParams: Promise<{
    sharedNoteId?: string;
    privateNoteId?: string;
    noteFocus?: string;
    meeting?: string;
    chat?: string;
    recording?: string;
  }>;
};


export default async function MeetingSessionPage({ params, searchParams }: PageProps) {
  const { id, meetingId } = await params;
  const {
    sharedNoteId,
    privateNoteId,
    noteFocus,
    meeting: meetingStatus,
    chat: chatStatus,
    recording: recordingStatus,
  } = await searchParams;

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      workspaceId: id,
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          members: {
            where: {
              status: "ACTIVE",
            },
            select: {
              userId: true,
              role: true,
            },
          },
        },
      },
      createdBy: {
        select: {
          displayName: true,
        },
      },
      participants: {
        where: {
          user: {
            deletedAt: null,
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          handRaisedAt: true,
          handLoweredAt: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      artifacts: {
        where: {
          OR: [
            {
              note: {
                deletedAt: null,
                visibility: "WORKSPACE_SHARED",
              },
            },
            {
              file: {
                visibility: "WORKSPACE_SHARED",
              },
            },
            ...(currentUser
              ? [
                  {
                    note: {
                      deletedAt: null,
                      visibility: "PRIVATE" as const,
                      ownerUserId: currentUser.id,
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          type: true,
          source: true,
          noteId: true,
          fileId: true,
          note: {
            select: {
              id: true,
              title: true,
              type: true,
              visibility: true,
              ownerUserId: true,
              collaboration: true,
              updatedAt: true,
              deletedAt: true,
              owner: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          file: {
            select: {
              id: true,
              name: true,
              visibility: true,
              uploadedBy: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          createdBy: {
            select: {
              displayName: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      recordings: {
        select: {
          id: true,
          status: true,
          startedAt: true,
          stoppedAt: true,
          completedAt: true,
          errorMessage: true,
          startedBy: {
            select: {
              displayName: true,
            },
          },
          stoppedBy: {
            select: {
              displayName: true,
            },
          },
          file: {
            select: {
              id: true,
              name: true,
              sizeBytes: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      channel: {
        select: {
          id: true,
          name: true,
          messages: {
            select: {
              id: true,
              channelId: true,
              senderUserId: true,
              body: true,
              createdAt: true,
              editedAt: true,
              deletedAt: true,
              sender: {
                select: {
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 100,
          },
        },
      },
      moderationSettings: true,
      permissionOverrides: {
        select: {
          id: true,
          userId: true,
          targetType: true,
          artifactId: true,
          state: true,
          user: {
            select: {
              displayName: true,
              email: true,
            },
          },
          artifact: {
            select: {
              note: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!meeting || !meeting.workspace) {
    notFound();
  }

  if (!meeting.workspace.members.some((member) => member.userId === currentUser.id)) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const sharedArtifacts = meeting.artifacts.filter(
    (artifact) =>
      (artifact.note?.visibility === "WORKSPACE_SHARED" && !artifact.note.deletedAt) ||
      artifact.file?.visibility === "WORKSPACE_SHARED",
  );
  const privateNoteArtifacts = meeting.artifacts.filter(
    (artifact) =>
      artifact.note?.visibility === "PRIVATE" &&
      artifact.note.ownerUserId === currentUser.id &&
      !artifact.note.deletedAt &&
      (artifact.type === "NOTE" || artifact.type === "WHITEBOARD"),
  );
  const sharedNoteArtifacts = sharedArtifacts.filter(
    (artifact) => artifact.note && (artifact.type === "NOTE" || artifact.type === "WHITEBOARD"),
  );

  const attachedNoteIds = new Set(
    sharedArtifacts.map((artifact) => artifact.noteId).filter((noteId): noteId is string => Boolean(noteId)),
  );
  const attachedFileIds = new Set(
    sharedArtifacts.map((artifact) => artifact.fileId).filter((fileId): fileId is string => Boolean(fileId)),
  );

  const selectedSharedArtifact =
    sharedNoteArtifacts.find((artifact) => artifact.noteId === sharedNoteId) ?? sharedNoteArtifacts[0];
  const selectedPrivateArtifact =
    privateNoteArtifacts.find((artifact) => artifact.noteId === privateNoteId) ?? privateNoteArtifacts[0];
  const currentParticipant = meeting.participants.find(
    (participant) => participant.userId === currentUser.id,
  );
  const workspaceMembers = meeting.workspace.members;
  const currentMembership = workspaceMembers.find((member) => member.userId === currentUser.id);
  const canManageMeeting =
    meeting.createdByUserId === currentUser.id ||
    currentMembership?.role === "OWNER" ||
    currentMembership?.role === "ADMIN";
  const meetingPermissionOverrides = meeting.permissionOverrides as MeetingPermissionOverrideInput[];
  const pendingRequests = meeting.permissionOverrides.filter(
    (override) =>
      override.state === "REQUESTED" &&
      canManageMeetingParticipantPermissions({
        currentUserId: currentUser.id,
        meetingCreatedByUserId: meeting.createdByUserId,
        currentUserRole: currentMembership?.role,
        targetUserId: override.userId,
        targetUserRole: workspaceMembers.find((m) => m.userId === override.userId)?.role,
      }),
  );
  const pendingNotePermissionRequests: PendingMeetingPermissionRequest[] = pendingRequests.map((request) => ({
    userId: request.userId,
    targetType: request.targetType,
    artifactId: request.artifactId,
    user: request.user,
    artifact: request.artifact,
  }));
  const permissionContext = {
    currentUserId: currentUser.id,
    meetingCreatedByUserId: meeting.createdByUserId,
    currentUserRole: currentMembership?.role,
    settings: meeting.moderationSettings,
    overrides: meetingPermissionOverrides,
  };
  const videoPermissions = getMeetingVideoPermissions(permissionContext);
  const currentParticipantHandRaised = isHandRaised(currentParticipant);
  const raisedHandParticipants = meeting.participants.filter(isHandRaised);
  const canModerateChat = currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";
  const lifecycle = getMeetingLifecycle(meeting);
  const meetingEndsAt = getMeetingEndAt(meeting);
  const isCanceled = lifecycle === "canceled";
  const isSessionOpen = canJoinMeeting(lifecycle);
  const shouldPromptRsvp = currentParticipant?.status === "INVITED" && isSessionOpen;
  const canMutateArtifacts = canMutateMeetingArtifacts(lifecycle);
  const canEditNotes = canEditMeetingNotes(lifecycle);
  const canManageSchedule = canManageMeeting && canManageMeetingSchedule(lifecycle);
  const canUpdateRsvp = Boolean(currentParticipant) && canChangeMeetingRsvp(lifecycle);
  const selectedNoteIds = [
    selectedSharedArtifact?.noteId,
    selectedPrivateArtifact?.noteId,
  ].filter((noteId): noteId is string => Boolean(noteId));
  const [selectedNoteContents, attachableArtifacts] = await Promise.all([
    selectedNoteIds.length > 0
      ? prisma.note.findMany({
          where: {
            id: {
              in: selectedNoteIds,
            },
          },
          select: {
            id: true,
            contentJson: true,
          },
        })
      : [],
    canMutateArtifacts
      ? Promise.all([
          prisma.note.findMany({
            where: {
              workspaceId: id,
              deletedAt: null,
              visibility: "WORKSPACE_SHARED",
            },
            select: {
              id: true,
              title: true,
              type: true,
              updatedAt: true,
              owner: {
                select: {
                  displayName: true,
                },
              },
            },
            orderBy: {
              updatedAt: "desc",
            },
          }),
          prisma.file.findMany({
            where: {
              workspaceId: id,
              visibility: "WORKSPACE_SHARED",
            },
            select: {
              id: true,
              name: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          }),
        ])
      : [[], []],
  ]);
  const selectedNoteContentById = new Map(
    selectedNoteContents.map((note) => [note.id, note.contentJson]),
  );
  const selectedSharedContentJson = selectedSharedArtifact?.noteId
    ? selectedNoteContentById.get(selectedSharedArtifact.noteId)
    : undefined;
  const selectedPrivateContentJson = selectedPrivateArtifact?.noteId
    ? selectedNoteContentById.get(selectedPrivateArtifact.noteId)
    : undefined;
  const [attachableNotes, attachableFiles] = attachableArtifacts;
  const unattachedNotes = attachableNotes.filter((note) => !attachedNoteIds.has(note.id));
  const unattachedFiles = attachableFiles.filter((file) => !attachedFileIds.has(file.id));
  const hasAttachableArtifacts = unattachedNotes.length > 0 || unattachedFiles.length > 0;
  const activeRecording = meeting.recordings.find((recording) =>
    ["STARTING", "ACTIVE", "STOPPING"].includes(recording.status),
  );
  const latestRecording = activeRecording ?? meeting.recordings[0];
  const meetingChannel = meeting.channel
    ? {
        id: meeting.channel.id,
        name: meeting.channel.name,
        messages: [...meeting.channel.messages].reverse().map((message) => ({
          id: message.id,
          channelId: message.channelId,
          senderUserId: message.senderUserId,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          editedAt: message.editedAt?.toISOString() ?? null,
          deletedAt: message.deletedAt?.toISOString() ?? null,
          sender: {
            displayName: message.sender.displayName,
            avatarUrl: message.sender.avatarUrl,
          },
        })),
      }
    : null;

  // Convert Prisma artifacts to the serialisable shape the client component expects
  const sharedNoteSlotArtifacts = sharedNoteArtifacts
    .map((artifact) => toNoteArtifactData(artifact, permissionContext))
    .filter((a): a is NoteArtifactData => a !== null);
  const privateNoteSlotArtifacts = privateNoteArtifacts
    .map((artifact) => toNoteArtifactData(artifact, permissionContext))
    .filter((a): a is NoteArtifactData => a !== null);
  const selectedSharedData = selectedSharedArtifact?.noteId
    ? (sharedNoteSlotArtifacts.find((a) => a.noteId === selectedSharedArtifact.noteId) ?? null)
    : null;
  const selectedPrivateData = selectedPrivateArtifact?.noteId
    ? (privateNoteSlotArtifacts.find((a) => a.noteId === selectedPrivateArtifact.noteId) ?? null)
    : null;

  return (
    <main data-meeting-hub-main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <MeetingRouteRefresher />
      {(raisedHandParticipants.length > 0 || pendingRequests.length > 0) ? (
        <div className="sticky top-0 z-40 flex flex-col gap-0 divide-y divide-[#e8e0b5] border-b border-[#e8e0b5] bg-[#fffceb]">
          {raisedHandParticipants.length > 0 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-2 sm:px-8 lg:px-10">
              <p className="text-sm font-semibold text-[#7a5a15]">
                ✋ {formatRaisedHandNames(raisedHandParticipants)}
              </p>
              <a href="#meeting-participants" className="shrink-0 text-sm font-medium text-[#7a5a15] underline underline-offset-2">
                View
              </a>
            </div>
          ) : null}
          {pendingRequests.length > 0 ? (
            <div className="flex items-center justify-between gap-3 px-5 py-2 sm:px-8 lg:px-10">
              <p className="text-sm font-semibold text-[#7a5a15]">
                📝 {pendingRequests.length} access {pendingRequests.length === 1 ? "request" : "requests"} pending
              </p>
              <a href="#meeting-participants" className="shrink-0 text-sm font-medium text-[#7a5a15] underline underline-offset-2">
                View
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        data-meeting-hub-shell
        className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10"
      >
        <header id="meeting-overview" className="scroll-mt-6 border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${id}/meetings`} className="text-sm font-medium text-[#2f604b]">
            Back to meetings
          </Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                {meeting.workspace.name} / {getMeetingPhaseLabel(lifecycle)}
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[#171713]">
                {meeting.title}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#62645c]">
                {meeting.description ?? "No description yet."}
              </p>
            </div>
            <div className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#66685f] shadow-sm">
              <p className="font-medium text-[#20201d]">{formatMeetingLifecycleLabel(lifecycle)}</p>
              <p className="mt-1">
                {meeting.startsAt.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </header>

        {getMeetingStatusMessage(meetingStatus) ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
            {getMeetingStatusMessage(meetingStatus)}
          </p>
        ) : null}

        {getRecordingStatusMessage(recordingStatus) ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm">
            {getRecordingStatusMessage(recordingStatus)}
          </p>
        ) : null}

        {isCanceled ? (
          <section className="rounded-md border border-[#ead1cd] bg-[#fff7f5] p-4 text-sm text-[#7a3434] shadow-sm">
            <p className="font-semibold">This meeting was canceled.</p>
            {meeting.cancellationReason ? <p className="mt-2">{meeting.cancellationReason}</p> : null}
          </section>
        ) : null}

        {lifecycle === "ended" ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-4 text-sm text-[#66685f] shadow-sm">
            <p className="font-semibold text-[#20201d]">Recap mode</p>
            <p className="mt-2">
              Notes and artifacts are locked now. Chat history, attendance, files, and saved notes remain visible.
            </p>
          </section>
        ) : null}

        {canManageMeeting && !canManageSchedule && !isCanceled ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-4 text-sm text-[#66685f] shadow-sm">
            Meeting details are locked once a session starts or ends.
          </section>
        ) : null}

        {shouldPromptRsvp ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                  RSVP
                </p>
                <h2 className="mt-2 text-xl font-semibold">You are invited to this live session.</h2>
              </div>
              <form action={updateCurrentUserParticipantStatus} className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                <input type="hidden" name="workspaceId" value={id} />
                <input type="hidden" name="meetingId" value={meeting.id} />
                <PendingSubmitButton
                  name="status"
                  value="ACCEPTED"
                  pendingLabel="Saving..."
                  className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                >
                  Accept
                </PendingSubmitButton>
                <PendingSubmitButton
                  name="status"
                  value="DECLINED"
                  pendingLabel="Saving..."
                  className="rounded-md border border-[#b65b5b] bg-white px-4 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Decline
                </PendingSubmitButton>
              </form>
            </div>
          </section>
        ) : null}

        {canManageSchedule ? (
          <section className="grid gap-4 rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Meeting Settings</h2>
            <form action={updateMeetingDetails} className="grid gap-4 lg:grid-cols-[1fr_220px_160px_auto]">
              <input type="hidden" name="workspaceId" value={id} />
              <input type="hidden" name="meetingId" value={meeting.id} />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Title</span>
                <input
                  name="title"
                  required
                  defaultValue={meeting.title}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Starts</span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={formatDateTimeLocal(meeting.startsAt)}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Duration</span>
                <select
                  name="durationMinutes"
                  defaultValue={String(getDurationMinutes(meeting.startsAt, meeting.endsAt))}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                >
                  <option value="30">30 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                </select>
              </label>
              <div className="flex items-end">
                <PendingSubmitButton
                  pendingLabel="Saving..."
                  className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                >
                  Save
                </PendingSubmitButton>
              </div>
              <label className="grid gap-2 lg:col-span-4">
                <span className="text-sm font-medium text-[#4d4f47]">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={meeting.description ?? ""}
                  className="resize-y rounded-md border border-[#c8c8bd] bg-[#fbfbf8] p-3 text-sm leading-6 outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
            </form>
            <CancelMeetingForm workspaceId={id} meetingId={meeting.id} />
          </section>
        ) : null}

        {currentParticipant && isSessionOpen ? (
          <FloatingMeetingVideo
            workspaceId={id}
            meetingId={meeting.id}
            videoHref={`/workspaces/${id}/meetings/${meeting.id}/video`}
            recording={{
              activeRecording,
              canManage: canManageMeeting,
              latestRecording,
            }}
            permissions={{ ...videoPermissions, handRaised: currentParticipantHandRaised }}
          raisedHandCount={raisedHandParticipants.length}
          pendingRequestCount={pendingRequests.length}
          />
        ) : null}

        {latestRecording && !isCanceled ? (
          <RecordingStatusPanel
            workspaceId={id}
            meetingId={meeting.id}
            activeRecording={activeRecording}
            latestRecording={latestRecording}
          />
        ) : null}

        <section className="flex flex-col gap-4 rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-sm text-[#4d4f47] shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className={getMeetingStatusBadgeClassName(lifecycle)}>
              {getMeetingPhaseLabel(lifecycle)}
            </span>
            <span>{getSessionStatusLine(lifecycle, meeting.startsAt, meetingEndsAt)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[#66685f]">
            <span>{meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}</span>
            <span>{countActiveParticipants(meeting.participants)} in session</span>
            {pendingRequests.length > 0 ? (
              <Link href="#meeting-participants" className="font-medium text-[#7a5a15]">
                {pendingRequests.length} pending {pendingRequests.length === 1 ? "request" : "requests"}
              </Link>
            ) : null}
            <Link href="#meeting-chat" className="font-medium text-[#2f604b]">
              Chat
            </Link>
            <Link href="#meeting-notes" className="font-medium text-[#2f604b]">
              Notes and boards
            </Link>
          </div>
        </section>

        <section data-split-stack className="grid gap-6 xl:grid-cols-3">
            <section id="meeting-participants" className="flex min-h-0 flex-col rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm xl:col-span-2 xl:row-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    Participants
                    {pendingRequests.length > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-[#fff7df] px-2 py-0.5 text-xs font-semibold text-[#7a5a15]">
                        {pendingRequests.length}
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-1 text-sm text-[#66685f]">
                    {meeting.participants.length} total / {countActiveParticipants(meeting.participants)} in session
                  </p>
                </div>
              </div>
              {pendingRequests.length > 0 ? (
                <PendingPermissionRequestsPanel
                  workspaceId={id}
                  meetingId={meeting.id}
                  pendingRequests={pendingRequests}
                />
              ) : null}
              <div className="mt-4 min-h-0 max-h-[560px] overflow-y-auto rounded-md border border-[#e6e6dc]">
                <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_110px_220px] gap-3 border-b border-[#e6e6dc] bg-[#fbfbf8] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#777970] lg:grid">
                  <span>Participant</span>
                  <span>Status</span>
                  <span>Moderation</span>
                </div>
                {meeting.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="grid gap-2 border-b border-[#e6e6dc] px-3 py-2.5 last:border-0 lg:grid-cols-[minmax(0,1fr)_110px_220px] lg:items-start"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{participant.user.displayName}</p>
                      <p className="truncate text-sm text-[#777970]">{participant.user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-fit rounded-md bg-[#e7eee7] px-3 py-1 text-xs font-medium text-[#2f604b]">
                        {formatParticipantStatus(participant.status, participant.joinedAt, participant.leftAt)}
                      </span>
                      {isHandRaised(participant) ? (
                        <span className="w-fit rounded-md bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#7a5a15]">
                          ✋ Hand raised
                        </span>
                      ) : null}
                    </div>
                    {canManageMeetingParticipantPermissions({
                      ...permissionContext,
                      targetUserId: participant.userId,
                      targetUserRole: workspaceMembers.find((member) => member.userId === participant.userId)?.role,
                    }) ? (
                      <div className="flex flex-col gap-1.5">
                        {isHandRaised(participant) ? (
                          <form action={lowerParticipantHand}>
                            <input type="hidden" name="workspaceId" value={id} />
                            <input type="hidden" name="meetingId" value={meeting.id} />
                            <input type="hidden" name="userId" value={participant.userId} />
                            <PendingSubmitButton
                              pendingLabel="Lowering..."
                              className="min-h-8 rounded-md border border-[#c8c8bd] bg-white px-3 text-xs font-medium text-[#4d4f47] transition hover:bg-[#f7f7f2] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Lower Hand
                            </PendingSubmitButton>
                          </form>
                        ) : null}
                        <ParticipantPermissionControls
                          workspaceId={id}
                          meetingId={meeting.id}
                          userId={participant.userId}
                          overrides={meetingPermissionOverrides}
                          settings={meeting.moderationSettings}
                          selectedArtifact={
                            selectedSharedArtifact?.id && selectedSharedArtifact.note
                              ? {
                                  id: selectedSharedArtifact.id,
                                  targetType:
                                    selectedSharedArtifact.type === "WHITEBOARD" ? "WHITEBOARD" : "SHARED_NOTES",
                                  label: selectedSharedArtifact.type === "WHITEBOARD" ? "Board drawing" : "Shared note writing",
                                }
                              : null
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {currentParticipant ? (
              <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
                <h2 className="text-xl font-semibold">Your RSVP</h2>
                <p className="mt-3 text-sm text-[#66685f]">
                  Current RSVP: {currentParticipant.status.toLowerCase()}
                  {currentParticipant.joinedAt
                    ? ` / joined ${formatShortDateTime(currentParticipant.joinedAt)}`
                    : ""}
                  {currentParticipant.leftAt
                    ? ` / left ${formatShortDateTime(currentParticipant.leftAt)}`
                    : ""}
                </p>
                {canUpdateRsvp ? (
                  <form action={updateCurrentUserParticipantStatus} className="mt-5 grid grid-cols-2 gap-2">
                    <input type="hidden" name="workspaceId" value={id} />
                    <input type="hidden" name="meetingId" value={meeting.id} />
                    <PendingSubmitButton
                      name="status"
                      value="ACCEPTED"
                      pendingLabel="Saving..."
                      className="rounded-md border border-[#2f604b] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Accept
                    </PendingSubmitButton>
                    <PendingSubmitButton
                      name="status"
                      value="DECLINED"
                      pendingLabel="Saving..."
                      className="rounded-md border border-[#b65b5b] bg-white px-3 py-2 text-sm font-medium text-[#7a3434] transition hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Decline
                    </PendingSubmitButton>
                  </form>
                ) : (
                  <p className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-3 text-sm text-[#66685f]">
                    RSVP changes are closed for this meeting.
                  </p>
                )}
              </section>
            ) : null}

            <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Session Details</h2>
              <div className="mt-4 grid gap-2 text-sm text-[#66685f]">
                <p>Created by {meeting.createdBy.displayName}</p>
                <p>Provider: {meeting.provider ?? "not connected"}</p>
                <p>Ends: {formatShortDateTime(meetingEndsAt)}</p>
                <p>
                  {meeting.meetingUrl ? (
                    <Link
                      href={meeting.meetingUrl}
                      target="_blank"
                      rel="opener"
                      className="font-medium text-[#2f604b]"
                    >
                      Open video room
                    </Link>
                  ) : (
                    "No meeting link yet"
                  )}
                </p>
              </div>
            </section>
        </section>

        <MeetingChatPanel
          workspaceId={id}
          roomId={meetingChannel ? createChatRoomId(id, meetingChannel.id) : createChatRoomId(id, meeting.id)}
          channel={meetingChannel}
          currentUserId={currentUser.id}
          currentUserDisplayName={currentUser.displayName}
          currentUserAvatarUrl={currentUser.avatarUrl}
          canModerateChat={canModerateChat}
          status={chatStatus}
          title="Meeting Chat"
          emptyText="No messages in this meeting chat yet."
          placeholder="Message this meeting"
          openInChannelsHref={
            meetingChannel && !isCanceled ? `/workspaces/${id}/chat?channel=${meetingChannel.id}` : undefined
          }
          lazy
        />

        <MeetingNotesSection
          workspaceId={id}
          meetingId={meeting.id}
          canEditNotes={canEditNotes}
          shared={{
            selected: selectedSharedData,
            contentJson: selectedSharedContentJson,
            all: sharedNoteSlotArtifacts,
            disabled: isLockedMeetingNoteArtifact(selectedSharedArtifact, lifecycle),
          }}
          priv={{
            selected: selectedPrivateData,
            contentJson: selectedPrivateContentJson,
            all: privateNoteSlotArtifacts,
            disabled: isLockedMeetingNoteArtifact(selectedPrivateArtifact, lifecycle),
          }}
          selectedSharedNoteId={selectedSharedArtifact?.noteId ?? undefined}
          selectedPrivateNoteId={selectedPrivateArtifact?.noteId ?? undefined}
          initialFocused={noteFocus === "shared" || noteFocus === "private" ? noteFocus : undefined}
          pendingPermissionRequests={pendingNotePermissionRequests}
        />

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Saved Shared Artifacts</h2>
              <p className="mt-2 text-sm text-[#66685f]">
                Attach shared workspace resources to keep the session record together.
              </p>
            </div>
            <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
              {sharedArtifacts.length}
            </span>
          </div>

          {hasAttachableArtifacts && canMutateArtifacts ? (
            <div data-split-stack className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
              {unattachedNotes.length > 0 ? (
                <form action={attachNoteToMeeting} className="grid min-w-0 gap-3 rounded-md bg-[#fbfbf8] p-4">
                  <input type="hidden" name="workspaceId" value={id} />
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <label className="grid min-w-0 gap-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Attach shared note or whiteboard</span>
                    <select
                      name="noteId"
                      className="min-h-11 min-w-0 max-w-full rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                    >
                      {unattachedNotes.map((note) => (
                        <option key={note.id} value={note.id}>
                          {note.title} / {formatEnumLabel(note.type)} / {note.owner.displayName} / updated{" "}
                          {formatShortDate(note.updatedAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PendingSubmitButton
                    pendingLabel="Attaching..."
                    className="min-h-11 w-full rounded-md bg-[#2f604b] px-4 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                  >
                    Attach Note
                  </PendingSubmitButton>
                </form>
              ) : null}

              {unattachedFiles.length > 0 ? (
                <form action={attachFileToMeeting} className="grid min-w-0 gap-3 rounded-md bg-[#fbfbf8] p-4">
                  <input type="hidden" name="workspaceId" value={id} />
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <label className="grid min-w-0 gap-2">
                    <span className="text-sm font-medium text-[#4d4f47]">Attach shared file</span>
                    <select
                      name="fileId"
                      className="min-h-11 min-w-0 max-w-full rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                    >
                      {unattachedFiles.map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PendingSubmitButton
                    pendingLabel="Attaching..."
                    className="min-h-11 w-full rounded-md bg-[#2f604b] px-4 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                  >
                    Attach File
                  </PendingSubmitButton>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-4 text-sm text-[#66685f]">
              {canMutateArtifacts
                ? "All available shared notes and files are already attached, or there are no shared resources yet."
                : "This meeting is in recap mode, so saved artifacts are view-only."}
            </p>
          )}

          {sharedArtifacts.length > 0 ? (
            <div data-split-stack className="mt-5 grid gap-4 md:grid-cols-2">
              {sharedArtifacts.map((artifact) => (
                <article key={artifact.id} className="rounded-md border border-[#e6e6dc] bg-[#fbfbf8] p-4">
                  <p className="text-sm font-medium text-[#2f604b]">{formatEnumLabel(artifact.type)}</p>
                  <h3 className="mt-2 font-semibold">
                    {artifact.note?.title ?? artifact.file?.name ?? "Saved artifact"}
                  </h3>
                  <p className="mt-2 text-sm text-[#66685f]">
                    Added by {artifact.createdBy.displayName}
                    {artifact.note ? ` / owned by ${artifact.note.owner.displayName}` : ""}
                    {artifact.file ? ` / uploaded by ${artifact.file.uploadedBy.displayName}` : ""}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {artifact.note ? (
                      <Link
                        href={`/workspaces/${id}/meetings/${meeting.id}?sharedNoteId=${artifact.note.id}${
                          selectedPrivateArtifact?.noteId
                            ? `&privateNoteId=${selectedPrivateArtifact.noteId}`
                            : ""
                        }#meeting-notes`}
                        className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
                      >
                        Select Here
                      </Link>
                    ) : null}
                    {artifact.file ? (
                      <Link
                        href={`/api/files/${artifact.file.id}`}
                        className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
                        target="_blank"
                      >
                        Open File
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-[#66685f]">
              Shared notes, whiteboards, files, PDFs, and recordings saved from this session will show up here.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

type ArtifactWithNote = {
  id: string;
  noteId: string | null;
  source: string;
  type: string;
  note: {
    id: string;
    title: string;
    type: string;
    visibility: string;
    ownerUserId: string;
    collaboration: string;
    updatedAt?: Date;
    owner?: {
      displayName: string;
    };
  } | null;
};

type RecordingCard = {
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

function ParticipantPermissionControls({
  meetingId,
  overrides,
  selectedArtifact,
  settings,
  userId,
  workspaceId,
}: {
  meetingId: string;
  overrides: MeetingPermissionOverrideInput[];
  selectedArtifact: {
    id: string;
    label: string;
    targetType: "SHARED_NOTES" | "WHITEBOARD";
  } | null;
  settings: Parameters<typeof getDefaultPermission>[1];
  userId: string;
  workspaceId: string;
}) {
  const controls = [
    { label: "Mic", targetType: "MICROPHONE" as const },
    { label: "Camera", targetType: "CAMERA" as const },
    { label: "Screen share", targetType: "SCREEN_SHARE" as const },
    ...(selectedArtifact
      ? [
          {
            label: selectedArtifact.label,
            targetType: selectedArtifact.targetType,
            artifactId: selectedArtifact.id,
          },
        ]
      : []),
  ];

  const permissionRows = controls.map((control) => {
    const status = getPermissionStatus({
          artifactId: control.artifactId,
          overrides,
          targetType: control.targetType,
          userId,
          settings,
        });
    return {
      ...control,
      key: `${control.targetType}:${control.artifactId ?? "meeting"}`,
      nextState: status.allowed ? ("DENIED" as const) : ("ALLOWED" as const),
      status,
    };
  });
  const blockedCount = permissionRows.filter((row) => !row.status.allowed).length;
  const requestedCount = permissionRows.filter((row) => row.status.source === "requested").length;

  return (
    <details className="group w-full min-w-0">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-2.5 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] [&::-webkit-details-marker]:hidden">
        <span>Permissions</span>
        <span className="truncate text-xs font-normal text-[#66685f]">
          {requestedCount > 0 ? `${requestedCount} requested` : blockedCount > 0 ? `${blockedCount} blocked` : "All allowed"}
        </span>
      </summary>
      <div className="mt-2 grid gap-1 rounded-md border border-[#e6e6dc] bg-[#fbfbf8] p-1.5">
        {permissionRows.map((row) => (
          <div
            key={row.key}
            className="grid gap-1.5 rounded-sm px-1.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <span className="truncate text-sm font-medium text-[#4d4f47]">{row.label}</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={getPermissionBadgeClassName(row.status.allowed, row.status.source)}>
                {row.status.label}
              </span>
              <PermissionOverrideButton
                workspaceId={workspaceId}
                meetingId={meetingId}
                userId={userId}
                targetType={row.targetType}
                state={row.nextState}
                artifactId={row.artifactId}
                label={row.status.allowed ? "Block" : "Allow"}
                variant={row.status.allowed ? "danger" : "primary"}
              />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function PermissionOverrideButton({
  artifactId,
  label,
  meetingId,
  variant,
  state,
  targetType,
  userId,
  workspaceId,
}: {
  artifactId?: string;
  label: string;
  meetingId: string;
  variant: "danger" | "primary";
  state: "ALLOWED" | "DENIED";
  targetType: "SHARED_NOTES" | "WHITEBOARD" | "MICROPHONE" | "CAMERA" | "SCREEN_SHARE";
  userId: string;
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

function PendingPermissionRequestsPanel({
  meetingId,
  pendingRequests,
  workspaceId,
}: {
  meetingId: string;
  pendingRequests: Array<{
    userId: string;
    targetType: MeetingPermissionTargetType;
    artifactId: string | null;
    user: { displayName: string; email: string };
    artifact: { note: { title: string } | null } | null;
  }>;
  workspaceId: string;
}) {
  return (
    <div className="mt-4 rounded-md border border-[#e8e0b5] bg-[#fffceb] p-4">
      <p className="text-sm font-semibold text-[#7a5a15]">
        {pendingRequests.length} pending permission {pendingRequests.length === 1 ? "request" : "requests"}
      </p>
      <div className="mt-3 grid gap-2">
        {pendingRequests.map((request) => (
          <div
            key={`${request.userId}:${request.targetType}:${request.artifactId ?? "meeting"}`}
            className="grid gap-1.5 rounded-md border border-[#e8e0b5] bg-white px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#20201d]">{request.user.displayName}</p>
              <p className="truncate text-xs text-[#777970]">
                {getPermissionTargetLabel(request.targetType)}
                {request.artifact?.note?.title ? ` — ${request.artifact.note.title}` : ""}
              </p>
            </div>
            <div className="flex gap-1.5">
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
    </div>
  );
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

function getPermissionStatus({
  artifactId,
  overrides,
  settings,
  targetType,
  userId,
}: {
  artifactId?: string;
  overrides: MeetingPermissionOverrideInput[];
  settings: Parameters<typeof getDefaultPermission>[1];
  targetType: MeetingPermissionTargetType;
  userId: string;
}) {
  const override =
    overrides.find(
      (item) =>
        item.userId === userId &&
        item.targetType === targetType &&
        item.artifactId === (artifactId ?? null),
    ) ??
    overrides.find(
      (item) =>
        item.userId === userId &&
        item.targetType === targetType &&
        item.artifactId === null,
    );

  if (override?.state === "REQUESTED") {
    return {
      allowed: false,
      label: "Requested",
      source: "requested" as const,
    };
  }

  if (override?.state === "ALLOWED") {
    return {
      allowed: true,
      label: "Allowed",
      source: "override" as const,
    };
  }

  if (override?.state === "DENIED") {
    return {
      allowed: false,
      label: "Blocked",
      source: "override" as const,
    };
  }

  const allowedByDefault = getDefaultPermission(targetType, settings);

  return {
    allowed: allowedByDefault,
    label: allowedByDefault ? "Allowed by default" : "Blocked by default",
    source: "default" as const,
  };
}

function getPermissionBadgeClassName(
  allowed: boolean,
  source: "default" | "override" | "requested",
) {
  if (source === "requested") {
    return "rounded-md bg-[#fff7df] px-2 py-1 text-[11px] font-semibold text-[#7a5a15]";
  }

  if (allowed) {
    return source === "default"
      ? "rounded-md bg-[#e7eee7] px-2 py-1 text-[11px] font-semibold text-[#2f604b]"
      : "rounded-md bg-[#dff4e5] px-2 py-1 text-[11px] font-semibold text-[#1d6a3b]";
  }

  return source === "default"
    ? "rounded-md bg-[#ecece4] px-2 py-1 text-[11px] font-semibold text-[#55584f]"
    : "rounded-md bg-[#fff0ed] px-2 py-1 text-[11px] font-semibold text-[#7a3434]";
}

function getPermissionButtonClassName(variant: "danger" | "primary") {
  if (variant === "danger") {
    return "min-h-8 w-full rounded-md border border-[#b65b5b] bg-white px-3 text-xs font-medium text-[#7a3434] transition hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60 sm:w-16";
  }

  return "min-h-8 w-full rounded-md border border-[#2f604b] bg-white px-3 text-xs font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60 sm:w-16";
}

function RecordingStatusPanel({
  activeRecording,
  latestRecording,
  meetingId,
  workspaceId,
}: {
  activeRecording: RecordingCard | undefined;
  latestRecording: RecordingCard | undefined;
  meetingId: string;
  workspaceId: string;
}) {
  return (
    <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">Recording</p>
          <h2 className="mt-2 text-xl font-semibold">{getRecordingPanelTitle(latestRecording)}</h2>
          {latestRecording ? (
            <p className="mt-2 text-sm leading-6 text-[#66685f]">
              Started by {latestRecording.startedBy.displayName} / {formatShortDateTime(latestRecording.startedAt)}
              {latestRecording.stoppedBy ? ` / stopped by ${latestRecording.stoppedBy.displayName}` : ""}
              {latestRecording.file?.sizeBytes ? ` / ${formatFileSize(latestRecording.file.sizeBytes)}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#66685f]">
              Recordings saved from video appear here and in this workspace&apos;s Files.
            </p>
          )}
          {latestRecording?.errorMessage ? (
            <p className="mt-2 text-sm text-[#7a3434]">{latestRecording.errorMessage}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {activeRecording ? (
            <Link
              href={`/workspaces/${workspaceId}/meetings/${meetingId}/video`}
              className="inline-flex min-h-11 items-center rounded-md border border-[#c8c8bd] bg-white px-4 text-sm font-medium text-[#4d4f47] transition hover:bg-[#fbfbf8]"
            >
              Manage in Video
            </Link>
          ) : null}

          {latestRecording?.file ? (
            <Link
              href={`/api/files/${latestRecording.file.id}`}
              target="_blank"
              className="inline-flex min-h-11 items-center rounded-md bg-[#2f604b] px-4 text-sm font-medium text-white transition hover:bg-[#244b3a]"
            >
              Open Recording
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}



function toNoteArtifactData(
  artifact: ArtifactWithNote,
  permissionContext: {
    currentUserId: string;
    meetingCreatedByUserId: string;
    currentUserRole?: string | null;
    settings: Parameters<typeof canEditMeetingSharedNote>[0]["settings"];
    overrides: MeetingPermissionOverrideInput[];
  },
) {
  if (!artifact.noteId || !artifact.note) return null;
  const permissionState =
    permissionContext.overrides.find(
      (override) =>
        override.userId === permissionContext.currentUserId &&
        override.artifactId === artifact.id &&
        override.targetType === (artifact.note?.type === "WHITEBOARD" ? "WHITEBOARD" : "SHARED_NOTES"),
    )?.state ?? null;
  const canEdit =
    artifact.note.visibility === "PRIVATE"
      ? artifact.note.ownerUserId === permissionContext.currentUserId ||
        artifact.note.collaboration === "COLLABORATIVE"
      : artifact.note.type === "WHITEBOARD"
        ? canEditMeetingWhiteboard({ ...permissionContext, artifactId: artifact.id })
        : canEditMeetingSharedNote({ ...permissionContext, artifactId: artifact.id });

  return {
    artifactId: artifact.id,
    noteId: artifact.noteId,
    noteType: artifact.note.type as "TEXT" | "WHITEBOARD",
    noteTitle: artifact.note.title,
    noteOwnerUserId: artifact.note.ownerUserId,
    noteCollaboration: artifact.note.collaboration,
    noteUpdatedAt: artifact.note.updatedAt instanceof Date ? artifact.note.updatedAt.toISOString() : null,
    noteOwnerDisplayName: artifact.note.owner?.displayName ?? null,
    canEdit,
    permissionState,
  };
}


function formatEnumLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatShortDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatShortDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getDurationMinutes(startsAt: Date, endsAt?: Date | null) {
  if (!endsAt) {
    return 60;
  }

  const duration = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  return [30, 60, 90, 120].includes(duration) ? duration : 60;
}

function getMeetingStatusMessage(status?: string) {
  switch (status) {
    case "updated":
      return "Meeting details updated.";
    case "joined":
      return "You joined the meeting.";
    case "left":
      return "You left the meeting.";
    case "not-joinable":
      return "This meeting is not open for joining right now.";
    case "invalid":
      return "Check the meeting details and try again.";
    case "unauthorized":
      return "You do not have permission to change this meeting.";
    case "read-only":
      return "This meeting is read-only now.";
    case "permission-denied":
      return "You do not have permission for that meeting action yet.";
    default:
      return null;
  }
}

function getRecordingStatusMessage(status?: string) {
  switch (status) {
    case "started":
      return "Recording started.";
    case "stopped":
      return "Recording stopped. The file may need a moment to finish processing.";
    case "refreshed":
      return "Recording status refreshed.";
    case "already-active":
      return "This meeting is already being recorded.";
    case "already-complete":
      return "This recording is already complete.";
    case "not-open":
      return "Recording is available only while the meeting video room is open.";
    case "no-video-participants":
      return "Recording starts after at least one participant joins video.";
    case "unauthorized":
      return "You do not have permission to manage recordings.";
    case "start-failed":
      return "Recording could not be started. Check LiveKit and recording storage settings.";
    case "stop-failed":
      return "Recording could not be stopped.";
    case "refresh-failed":
      return "Recording status could not be refreshed.";
    default:
      return null;
  }
}

function getRecordingPanelTitle(recording?: RecordingCard) {
  switch (recording?.status) {
    case "STARTING":
      return "Recording is starting";
    case "ACTIVE":
      return "Recording live";
    case "STOPPING":
      return "Recording is finalizing";
    case "COMPLETED":
      return "Recording saved";
    case "FAILED":
      return "Recording failed";
    default:
      return "Record this meeting";
  }
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMeetingPhaseLabel(state: MeetingLifecycleState) {
  switch (state) {
    case "live":
      return "live session";
    case "joinable":
      return "ready to join";
    case "ended":
      return "recap";
    case "canceled":
      return "canceled";
    default:
      return "prep";
  }
}

function getSessionStatusLine(state: MeetingLifecycleState, startsAt: Date, endsAt: Date) {
  switch (state) {
    case "live":
      return `Live until ${formatShortDateTime(endsAt)}.`;
    case "joinable":
      return `Video is open. Starts at ${formatShortDateTime(startsAt)}.`;
    case "ended":
      return `Ended around ${formatShortDateTime(endsAt)}.`;
    case "canceled":
      return "Canceled. Saved artifacts and chat history remain available.";
    case "starting-soon":
      return `Starts at ${formatShortDateTime(startsAt)}.`;
    default:
      return `Starts at ${formatShortDateTime(startsAt)}.`;
  }
}

function getMeetingStatusBadgeClassName(state: MeetingLifecycleState) {
  if (state === "live" || state === "joinable") {
    return "rounded-md bg-[#e7eee7] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#2f604b]";
  }

  if (state === "ended") {
    return "rounded-md bg-[#ecece4] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#55584f]";
  }

  if (state === "canceled") {
    return "rounded-md bg-[#fff0ed] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a3434]";
  }

  return "rounded-md bg-[#f1f1e9] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#6d7f70]";
}

function formatRaisedHandNames(participants: { user: { displayName: string } }[]) {
  if (participants.length === 1) {
    return `${participants[0].user.displayName} raised their hand`;
  }
  if (participants.length === 2) {
    return `${participants[0].user.displayName} and ${participants[1].user.displayName} raised their hands`;
  }
  const others = participants.length - 2;
  return `${participants[0].user.displayName}, ${participants[1].user.displayName} and ${others} other${others === 1 ? "" : "s"} raised their hands`;
}

function isHandRaised(participant: { handRaisedAt?: Date | null; handLoweredAt?: Date | null } | undefined) {
  if (!participant?.handRaisedAt) return false;
  return !participant.handLoweredAt || participant.handLoweredAt < participant.handRaisedAt;
}

function countActiveParticipants(participants: { joinedAt?: Date | null; leftAt?: Date | null }[]) {
  return participants.filter((participant) => participant.joinedAt && !participant.leftAt).length;
}

function formatParticipantStatus(status: string, joinedAt?: Date | null, leftAt?: Date | null) {
  if (joinedAt && !leftAt) {
    return "in session";
  }

  if (joinedAt) {
    return "attended";
  }

  return status.toLowerCase();
}

function isLockedMeetingNoteArtifact(
  artifact: ArtifactWithNote | undefined,
  state: MeetingLifecycleState,
) {
  return (
    artifact?.source === "CREATED_IN_MEETING" &&
    artifact.note?.visibility === "WORKSPACE_SHARED" &&
    !canEditMeetingNotes(state)
  );
}
