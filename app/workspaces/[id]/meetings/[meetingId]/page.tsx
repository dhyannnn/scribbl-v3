import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { MeetingRouteRefresher } from "@/components/MeetingRouteRefresher";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { TextNoteEditor } from "@/components/TextNoteEditor";
import { TldrawWhiteboardEditor } from "@/components/TldrawWhiteboardEditor";
import { getCurrentUser } from "@/lib/current-user";
import { createChatRoomId, createNoteRoomId } from "@/lib/liveblocks-room";
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
import { CancelMeetingForm } from "../CancelMeetingForm";
import { updateMeetingDetails } from "../actions";
import { MeetingChatPanel } from "./MeetingChatPanel";
import { FloatingMeetingVideo } from "./video/FloatingMeetingVideo";
import {
  attachFileToMeeting,
  attachNoteToMeeting,
  createMeetingNote,
  saveMeetingNote,
  saveMeetingWhiteboard,
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
  const currentMembership = meeting.workspace.members.find((member) => member.userId === currentUser.id);
  const canManageMeeting =
    meeting.createdByUserId === currentUser.id ||
    currentMembership?.role === "OWNER" ||
    currentMembership?.role === "ADMIN";
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
          },
        })),
      }
    : null;

  return (
    <main data-meeting-hub-main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <MeetingRouteRefresher />
      <div
        data-meeting-hub-shell
        className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10"
      >
        <header className="border-b border-[#d8d8ce] pb-6">
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
            <Link href="#meeting-chat" className="font-medium text-[#2f604b]">
              Chat
            </Link>
            <Link href="#meeting-notes" className="font-medium text-[#2f604b]">
              Notes and boards
            </Link>
          </div>
        </section>

        <section data-split-stack className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold">Participants</h2>
              <div className="mt-5 grid gap-3">
                {meeting.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between gap-3 border-b border-[#e6e6dc] pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{participant.user.displayName}</p>
                      <p className="text-sm text-[#777970]">{participant.user.email}</p>
                    </div>
                    <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-xs font-medium text-[#2f604b]">
                      {formatParticipantStatus(participant.status, participant.joinedAt, participant.leftAt)}
                    </span>
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
          canModerateChat={canModerateChat}
          status={chatStatus}
          title="Meeting Chat"
          emptyText="No messages in this meeting chat yet."
          placeholder="Message this meeting"
          openInChannelsHref={
            meetingChannel && !isCanceled ? `/workspaces/${id}/chat?channel=${meetingChannel.id}` : undefined
          }
        />

        <section id="meeting-notes" data-split-stack className="scroll-mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <MeetingNoteHeader
              title="Shared Meeting Notes"
              badge="Everyone"
              workspaceId={id}
              meetingId={meeting.id}
              scope="SHARED"
              disabled={!canEditNotes}
            />
            {sharedNoteArtifacts.length > 0 ? (
              <NotePicker
                label="Choose shared note or board"
                workspaceId={id}
                meetingId={meeting.id}
                name="sharedNoteId"
                selectedId={selectedSharedArtifact?.noteId ?? ""}
                artifacts={sharedNoteArtifacts}
                preserveName="privateNoteId"
                preserveValue={selectedPrivateArtifact?.noteId}
              />
            ) : null}
              <MeetingNoteEditor
                workspaceId={id}
                meetingId={meeting.id}
                artifact={selectedSharedArtifact}
                contentJson={selectedSharedContentJson}
                currentUserId={currentUser.id}
                emptyText="Create a shared note or board for everyone in the meeting."
                disabled={isLockedMeetingNoteArtifact(selectedSharedArtifact, lifecycle)}
              />
          </section>

          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <MeetingNoteHeader
              title="My Private Notes"
              badge="Only you"
              workspaceId={id}
              meetingId={meeting.id}
              scope="PRIVATE"
              disabled={!canEditNotes}
            />
            {privateNoteArtifacts.length > 0 ? (
              <NotePicker
                label="Choose private note or board"
                workspaceId={id}
                meetingId={meeting.id}
                name="privateNoteId"
                selectedId={selectedPrivateArtifact?.noteId ?? ""}
                artifacts={privateNoteArtifacts}
                preserveName="sharedNoteId"
                preserveValue={selectedSharedArtifact?.noteId}
              />
            ) : null}
              <MeetingNoteEditor
                workspaceId={id}
                meetingId={meeting.id}
                artifact={selectedPrivateArtifact}
                contentJson={selectedPrivateContentJson}
                currentUserId={currentUser.id}
                emptyText="Create private notes while the lesson is happening. They will not appear in shared artifacts."
                disabled={isLockedMeetingNoteArtifact(selectedPrivateArtifact, lifecycle)}
              />
          </section>
        </section>

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

function MeetingNoteHeader({
  title,
  badge,
  workspaceId,
  meetingId,
  scope,
  disabled,
}: {
  title: string;
  badge: string;
  workspaceId: string;
  meetingId: string;
  scope: "SHARED" | "PRIVATE";
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="mt-2 inline-flex rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
          {badge}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={createMeetingNote}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="type" value="TEXT" />
          <PendingSubmitButton
            className="rounded-md bg-[#2f604b] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            pendingLabel="Creating..."
          >
            New Note
          </PendingSubmitButton>
        </form>
        <form action={createMeetingNote}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="type" value="WHITEBOARD" />
          <PendingSubmitButton
            className="rounded-md border border-[#2f604b] bg-white px-3 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            pendingLabel="Creating..."
          >
            New Board
          </PendingSubmitButton>
        </form>
      </div>
    </div>
  );
}

function NotePicker({
  label,
  workspaceId,
  meetingId,
  name,
  selectedId,
  artifacts,
  preserveName,
  preserveValue,
}: {
  label: string;
  workspaceId: string;
  meetingId: string;
  name: string;
  selectedId: string;
  artifacts: ArtifactWithNote[];
  preserveName: string;
  preserveValue?: string | null;
}) {
  return (
    <form
      action={`/workspaces/${workspaceId}/meetings/${meetingId}#meeting-notes`}
      className="mt-5 grid max-w-full gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto]"
    >
      {preserveValue ? <input type="hidden" name={preserveName} value={preserveValue} /> : null}
      <label className="grid min-w-0 gap-2">
        <span className="text-sm font-medium text-[#4d4f47]">{label}</span>
        <select
          name={name}
          defaultValue={selectedId}
          className="min-h-11 min-w-0 max-w-full rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
        >
          {artifacts.map((artifact) =>
            artifact.note ? (
              <option key={artifact.note.id} value={artifact.note.id}>
                {artifact.note.title} / {formatEnumLabel(artifact.note.type)}
                {artifact.note.owner ? ` / ${artifact.note.owner.displayName}` : ""}
                {artifact.note.updatedAt ? ` / updated ${formatShortDate(artifact.note.updatedAt)}` : ""}
              </option>
            ) : null,
          )}
        </select>
      </label>
      <div className="flex min-w-0 items-end">
        <button className="min-h-11 w-full rounded-md border border-[#2f604b] bg-white px-4 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] min-[720px]:w-auto">
          Switch
        </button>
      </div>
    </form>
  );
}

function MeetingNoteEditor({
  workspaceId,
  meetingId,
  artifact,
  contentJson,
  currentUserId,
  emptyText,
  disabled,
}: {
  workspaceId: string;
  meetingId: string;
  artifact: ArtifactWithNote | undefined;
  contentJson: unknown;
  currentUserId?: string;
  emptyText: string;
  disabled: boolean;
}) {
  if (!artifact?.note) {
    return (
      <div className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-5 text-sm leading-6 text-[#66685f]">
        {emptyText}
      </div>
    );
  }

  const canEdit =
    Boolean(currentUserId) &&
    !disabled &&
    (artifact.note.ownerUserId === currentUserId || artifact.note.collaboration === "COLLABORATIVE");
  const liveblocksRoomId = createNoteRoomId(workspaceId, artifact.note.id);

  if (artifact.note.type === "WHITEBOARD") {
    return (
      <LiveblocksRoom roomId={liveblocksRoomId}>
        <TldrawWhiteboardEditor
          workspaceId={workspaceId}
          meetingId={meetingId}
          noteId={artifact.note.id}
          title={artifact.note.title}
          initialSnapshot={getTldrawSnapshot(contentJson)}
          saveAction={saveMeetingWhiteboard}
          canEdit={canEdit}
        />
      </LiveblocksRoom>
    );
  }

  return (
    <LiveblocksRoom roomId={liveblocksRoomId}>
      <TextNoteEditor
        workspaceId={workspaceId}
        meetingId={meetingId}
        noteId={artifact.note.id}
        title={artifact.note.title}
        contentJson={contentJson}
        saveAction={saveMeetingNote}
        canEdit={canEdit}
      />
    </LiveblocksRoom>
  );
}


function getTldrawSnapshot(contentJson: unknown) {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  return c?.type === "tldraw" ? c.snapshot : null;
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
