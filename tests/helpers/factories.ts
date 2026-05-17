import type { User, Workspace, WorkspaceMember, WorkspaceInvite, Meeting } from "@prisma/client";

let seq = 0;
const id = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;

export function makeUser(overrides: Partial<User> = {}): User {
  const uid = id();
  return {
    id: uid,
    authUserId: `auth-${uid}`,
    email: `user-${uid}@test.com`,
    firstName: "Test",
    lastName: "User",
    displayName: "Test User",
    role: "STUDENT" as const,
    avatarUrl: null,
    deletionRequestedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeWorkspace(createdByUserId: string, overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: id(),
    name: "Test Workspace",
    type: "TEAM",
    description: null,
    plan: "FREE",
    organizationId: null,
    createdByUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeMembership(
  workspaceId: string,
  userId: string,
  overrides: Partial<WorkspaceMember> = {},
): WorkspaceMember {
  return {
    id: id(),
    workspaceId,
    userId,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeInvite(workspaceId: string, invitedByUserId: string, overrides: Partial<WorkspaceInvite> = {}): WorkspaceInvite {
  return {
    id: id(),
    workspaceId,
    email: `invite-${id()}@test.com`,
    role: "MEMBER",
    token: `token-${id()}`,
    status: "PENDING",
    invitedByUserId,
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeMeeting(workspaceId: string, createdByUserId: string, overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: id(),
    workspaceId,
    title: "Test Meeting",
    description: null,
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    provider: null,
    providerMeetingId: null,
    meetingUrl: null,
    groupId: null,
    createdByUserId,
    canceledAt: null,
    canceledByUserId: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }
  return fd;
}

/** Captures the URL a server action redirected to, or throws if it didn't redirect. */
export async function captureRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    throw new Error("Expected a redirect but action completed without one");
  } catch (e: unknown) {
    const err = e as Error & { type?: string; url?: string };
    if (err.type === "redirect") return err.url!;
    throw e;
  }
}
