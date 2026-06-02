export type PollVoteData = { userId: string; optionIndex: number };

export type PollOptionData = { text: string; count: number };

export type PollData = {
  id: string;
  question: string;
  options: PollOptionData[];
  createdByUserId: string;
  createdByName: string;
  closedAt: string | null;
  createdAt: string;
  myVote: number | null;
  votes: PollVoteData[];
};

export function shapePoll(
  poll: {
    id: string;
    question: string;
    options: unknown;
    createdByUserId: string;
    closedAt: Date | null;
    createdAt: Date;
    createdBy: { displayName: string };
    votes: { userId: string; optionIndex: number }[];
  },
  currentUserId: string,
): PollData {
  const opts = poll.options as string[];
  return {
    id: poll.id,
    question: poll.question,
    options: opts.map((text, i) => ({
      text,
      count: poll.votes.filter((v) => v.optionIndex === i).length,
    })),
    createdByUserId: poll.createdByUserId,
    createdByName: poll.createdBy.displayName,
    closedAt: poll.closedAt?.toISOString() ?? null,
    createdAt: poll.createdAt.toISOString(),
    myVote: poll.votes.find((v) => v.userId === currentUserId)?.optionIndex ?? null,
    votes: poll.votes,
  };
}

export type PollEvent =
  | { type: "poll-created"; poll: PollData }
  | { type: "poll-voted"; pollId: string; userId: string; optionIndex: number; previousOptionIndex: number | null }
  | { type: "poll-closed"; pollId: string };
