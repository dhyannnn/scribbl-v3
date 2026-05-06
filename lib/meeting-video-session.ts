import "server-only";

import { canJoinMeeting, getMeetingLifecycle } from "@/lib/meeting-lifecycle";
import { prisma } from "@/lib/prisma";

export const clientSessionIdMaxLength = 80;

const clientSessionIdPattern = /^[A-Za-z0-9_-]{16,80}$/;

type VideoSessionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "access-denied" | "invalid-session" | "not-open";
    };

export function isValidClientSessionId(clientSessionId: string) {
  return clientSessionIdPattern.test(clientSessionId);
}

export async function startMeetingVideoSession({
  workspaceId,
  meetingId,
  userId,
  clientSessionId,
  markParticipantJoined = true,
}: {
  workspaceId: string;
  meetingId: string;
  userId: string;
  clientSessionId: string;
  markParticipantJoined?: boolean;
}): Promise<VideoSessionResult> {
  if (!workspaceId || !meetingId || !userId || !isValidClientSessionId(clientSessionId)) {
    return {
      ok: false,
      reason: "invalid-session",
    };
  }

  return prisma.$transaction(async (tx) => {
    const [participant, membership] = await Promise.all([
      tx.meetingParticipant.findFirst({
        where: {
          meetingId,
          userId,
          meeting: {
            workspaceId,
          },
        },
        select: {
          id: true,
          joinedAt: true,
          meeting: {
            select: {
              startsAt: true,
              endsAt: true,
              canceledAt: true,
            },
          },
        },
      }),
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
        select: {
          status: true,
        },
      }),
    ]);

    if (!participant || membership?.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "access-denied",
      };
    }

    if (!canJoinMeeting(getMeetingLifecycle(participant.meeting))) {
      return {
        ok: false,
        reason: "not-open",
      };
    }

    const now = new Date();

    await tx.meetingVideoSession.updateMany({
      where: {
        meetingId,
        userId,
        disconnectedAt: null,
        clientSessionId: {
          not: clientSessionId,
        },
      },
      data: {
        disconnectedAt: now,
        lastSeenAt: now,
      },
    });

    await tx.meetingVideoSession.upsert({
      where: {
        meetingId_userId_clientSessionId: {
          meetingId,
          userId,
          clientSessionId,
        },
      },
      create: {
        meetingId,
        userId,
        clientSessionId,
        connectedAt: now,
        lastSeenAt: now,
      },
      update: {
        disconnectedAt: null,
        lastSeenAt: now,
      },
    });

    if (markParticipantJoined) {
      await tx.meetingParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          status: "ACCEPTED",
          joinedAt: participant.joinedAt ?? now,
          leftAt: null,
        },
      });
    }

    return {
      ok: true,
    };
  });
}

export async function endMeetingVideoSession({
  workspaceId,
  meetingId,
  userId,
  clientSessionId,
}: {
  workspaceId: string;
  meetingId: string;
  userId: string;
  clientSessionId: string;
}): Promise<VideoSessionResult> {
  if (!workspaceId || !meetingId || !userId || !isValidClientSessionId(clientSessionId)) {
    return {
      ok: false,
      reason: "invalid-session",
    };
  }

  return prisma.$transaction(async (tx) => {
    const [participant, membership] = await Promise.all([
      tx.meetingParticipant.findFirst({
        where: {
          meetingId,
          userId,
          meeting: {
            workspaceId,
          },
        },
        select: {
          id: true,
        },
      }),
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
        select: {
          status: true,
        },
      }),
    ]);

    if (!participant || membership?.status !== "ACTIVE") {
      return {
        ok: false,
        reason: "access-denied",
      };
    }

    const now = new Date();
    const closedSession = await tx.meetingVideoSession.updateMany({
      where: {
        meetingId,
        userId,
        clientSessionId,
        disconnectedAt: null,
      },
      data: {
        disconnectedAt: now,
        lastSeenAt: now,
      },
    });

    if (closedSession.count === 0) {
      return {
        ok: true,
      };
    }

    const activeSessionCount = await tx.meetingVideoSession.count({
      where: {
        meetingId,
        userId,
        disconnectedAt: null,
      },
    });

    if (activeSessionCount === 0) {
      await tx.meetingParticipant.update({
        where: {
          id: participant.id,
        },
        data: {
          leftAt: now,
        },
      });
    }

    return {
      ok: true,
    };
  });
}
