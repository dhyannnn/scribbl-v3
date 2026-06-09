"use server";

import { getCurrentUser } from "@/lib/current-user";
import { canCreateMeetingPoll } from "@/lib/meeting-permissions";
import { shapePoll, type PollData } from "@/lib/polls";
import { prisma } from "@/lib/prisma";

const POLL_SELECT = {
  id: true,
  question: true,
  options: true,
  createdByUserId: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { displayName: true } },
  votes: { select: { userId: true, optionIndex: true } },
} as const;

export async function createPoll(formData: FormData): Promise<{ poll?: PollData; error?: string }> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "") || null;
  const channelId = String(formData.get("channelId") ?? "") || null;
  const question = String(formData.get("question") ?? "").trim();
  const rawOptions: string[] = [];
  for (let i = 0; i < 10; i++) {
    const opt = String(formData.get(`option_${i}`) ?? "").trim();
    if (opt) rawOptions.push(opt);
  }
  // Deduplicate, enforce length, strip HTML
  const seen = new Set<string>();
  const options: string[] = [];
  for (const opt of rawOptions) {
    if (opt.length > 200) return { error: "invalid" };
    const safe = opt.replace(/<[^>]*>/g, "");
    if (!seen.has(safe)) { seen.add(safe); options.push(safe); }
  }

  if (!workspaceId || !question.trim() || question.length > 500 || options.length < 2 || options.length > 10) return { error: "invalid" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthenticated" };

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: currentUser.id, status: "ACTIVE" },
    select: { role: true },
  });
  if (!membership) return { error: "unauthorized" };

  if (meetingId) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, workspaceId },
      select: { createdByUserId: true, moderationSettings: true },
    });
    if (!meeting) return { error: "not_found" };
    if (
      !canCreateMeetingPoll({
        currentUserId: currentUser.id,
        meetingCreatedByUserId: meeting.createdByUserId,
        currentUserRole: membership.role,
        settings: meeting.moderationSettings,
      })
    ) {
      return { error: "unauthorized" };
    }
  }

  const poll = await prisma.poll.create({
    data: { workspaceId, channelId, meetingId, question, options, createdByUserId: currentUser.id },
    select: POLL_SELECT,
  });

  return { poll: shapePoll(poll, currentUser.id) };
}

export async function castVote(
  formData: FormData,
): Promise<{ previousOptionIndex?: number | null; error?: string }> {
  const pollId = String(formData.get("pollId") ?? "");
  const optionIndex = Number(formData.get("optionIndex") ?? -1);

  if (!pollId || optionIndex < 0) return { error: "invalid" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthenticated" };

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { closedAt: true, options: true, workspaceId: true },
  });
  if (!poll || poll.closedAt) return { error: "closed" };
  if (optionIndex >= (poll.options as string[]).length) return { error: "invalid" };

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: poll.workspaceId, userId: currentUser.id, status: "ACTIVE" },
  });
  if (!membership) return { error: "unauthorized" };

  const existing = await prisma.pollVote.findUnique({
    where: { pollId_userId: { pollId, userId: currentUser.id } },
    select: { optionIndex: true },
  });

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId, userId: currentUser.id } },
    create: { pollId, userId: currentUser.id, optionIndex },
    update: { optionIndex },
  });

  return { previousOptionIndex: existing?.optionIndex ?? null };
}

export async function closePoll(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const pollId = String(formData.get("pollId") ?? "");
  if (!pollId) return { error: "invalid" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "unauthenticated" };

  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: {
      createdByUserId: true,
      workspaceId: true,
      meeting: { select: { createdByUserId: true } },
    },
  });
  if (!poll) return { error: "not_found" };

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: poll.workspaceId, userId: currentUser.id, status: "ACTIVE" },
    select: { role: true },
  });
  if (!membership) return { error: "unauthorized" };

  const isCreator = poll.createdByUserId === currentUser.id;
  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";
  const isMeetingCreator = poll.meeting?.createdByUserId === currentUser.id;
  if (!isCreator && !isAdmin && !isMeetingCreator) return { error: "unauthorized" };

  await prisma.poll.update({ where: { id: pollId }, data: { closedAt: new Date() } });
  return { ok: true };
}

export async function updateModerationSettings(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const meetingId = String(formData.get("meetingId") ?? "");
  const pollCreationEnabled = formData.get("pollCreationEnabled") === "on";

  if (!workspaceId || !meetingId) return;

  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const [meeting, membership] = await Promise.all([
    prisma.meeting.findFirst({
      where: { id: meetingId, workspaceId },
      select: { createdByUserId: true },
    }),
    prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: currentUser.id, status: "ACTIVE" },
      select: { role: true },
    }),
  ]);

  if (!meeting || !membership) return;

  const canManage =
    meeting.createdByUserId === currentUser.id ||
    membership.role === "OWNER" ||
    membership.role === "ADMIN";
  if (!canManage) return;

  await prisma.meetingModerationSettings.upsert({
    where: { meetingId },
    create: { meetingId, pollCreationEnabled },
    update: { pollCreationEnabled },
  });
}
