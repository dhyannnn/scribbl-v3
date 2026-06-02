"use client";

import { useState, useTransition, useRef } from "react";
import { useBroadcastEvent, useEventListener } from "@liveblocks/react/suspense";
import { LiveblocksRoom } from "@/components/LiveblocksRoom";
import { castVote, closePoll, createPoll } from "@/app/workspaces/[id]/polls/actions";
import type { PollData, PollEvent } from "@/lib/polls";

// ── Inner component — must be inside a Liveblocks room ───────────────────────

export function PollsPanelInner({
  initialPolls,
  currentUserId,
  canCreate,
  workspaceId,
  meetingId,
  channelId,
}: {
  initialPolls: PollData[];
  currentUserId: string;
  canCreate: boolean;
  workspaceId: string;
  meetingId?: string;
  channelId?: string;
}) {
  const [polls, setPolls] = useState<PollData[]>(initialPolls);
  const [showCreate, setShowCreate] = useState(false);
  const broadcast = useBroadcastEvent();

  useEventListener(({ event }) => {
    const ev = event as PollEvent;
    if (ev.type === "poll-created") {
      setPolls((cur) => (cur.some((p) => p.id === ev.poll.id) ? cur : [ev.poll, ...cur]));
    } else if (ev.type === "poll-voted") {
      setPolls((cur) =>
        cur.map((p) => {
          if (p.id !== ev.pollId) return p;
          const options = p.options.map((opt, i) => {
            let count = opt.count;
            if (ev.previousOptionIndex === i) count = Math.max(0, count - 1);
            if (ev.optionIndex === i) count += 1;
            return { ...opt, count };
          });
          const myVote = ev.userId === currentUserId ? ev.optionIndex : p.myVote;
          return { ...p, options, myVote };
        }),
      );
    } else if (ev.type === "poll-closed") {
      setPolls((cur) =>
        cur.map((p) => (p.id === ev.pollId ? { ...p, closedAt: new Date().toISOString() } : p)),
      );
    }
  });

  const open = polls.filter((p) => !p.closedAt);
  const closed = polls.filter((p) => p.closedAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-muted)]">
          Polls
        </p>
        {canCreate && !showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          >
            + New poll
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <CreatePollForm
          workspaceId={workspaceId}
          meetingId={meetingId}
          channelId={channelId}
          onCancel={() => setShowCreate(false)}
          onCreated={(poll) => {
            setPolls((cur) => [poll, ...cur]);
            setShowCreate(false);
            broadcast({ type: "poll-created", poll } as PollEvent);
          }}
        />
      ) : null}

      {polls.length === 0 && !showCreate ? (
        <p className="py-4 text-center text-sm text-[var(--color-subtle)]">
          No polls yet.{canCreate ? " Create one above." : ""}
        </p>
      ) : null}

      {open.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          currentUserId={currentUserId}
          onVote={(optionIndex, previousOptionIndex) => {
            setPolls((cur) =>
              cur.map((p) => {
                if (p.id !== poll.id) return p;
                const options = p.options.map((opt, i) => {
                  let count = opt.count;
                  if (previousOptionIndex === i) count = Math.max(0, count - 1);
                  if (optionIndex === i) count += 1;
                  return { ...opt, count };
                });
                return { ...p, options, myVote: optionIndex };
              }),
            );
            broadcast({
              type: "poll-voted",
              pollId: poll.id,
              userId: currentUserId,
              optionIndex,
              previousOptionIndex,
            } as PollEvent);
          }}
          onClose={() => {
            setPolls((cur) =>
              cur.map((p) => (p.id === poll.id ? { ...p, closedAt: new Date().toISOString() } : p)),
            );
            broadcast({ type: "poll-closed", pollId: poll.id } as PollEvent);
          }}
        />
      ))}

      {closed.length > 0 ? (
        <ClosedPollsSection polls={closed} currentUserId={currentUserId} />
      ) : null}
    </div>
  );
}

// ── Standalone wrapper — mounts its own Liveblocks room ──────────────────────

export function PollsPanel({
  roomId,
  ...innerProps
}: {
  roomId: string;
  initialPolls: PollData[];
  currentUserId: string;
  canCreate: boolean;
  workspaceId: string;
  meetingId?: string;
  channelId?: string;
}) {
  return (
    <LiveblocksRoom roomId={roomId} lazy>
      <PollsPanelInner {...innerProps} />
    </LiveblocksRoom>
  );
}

// ── Poll card ─────────────────────────────────────────────────────────────────

function PollCard({
  poll,
  currentUserId,
  onVote,
  onClose,
}: {
  poll: PollData;
  currentUserId: string;
  onVote: (optionIndex: number, previousOptionIndex: number | null) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showResponses, setShowResponses] = useState(false);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.count, 0);
  const canClose =
    poll.createdByUserId === currentUserId || poll.votes.some(() => false); // creator check

  function handleVote(optionIndex: number) {
    if (isPending) return;
    const previousOptionIndex = poll.myVote;
    onVote(optionIndex, previousOptionIndex);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pollId", poll.id);
      fd.set("optionIndex", String(optionIndex));
      await castVote(fd);
    });
  }

  function handleClose() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("pollId", poll.id);
      const result = await closePoll(fd);
      if (!result.error) onClose();
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-4">
      <p className="text-sm font-semibold text-[var(--color-text)]">{poll.question}</p>
      <p className="mt-0.5 text-xs text-[var(--color-subtle)]">by {poll.createdByName}</p>

      <div className="mt-3 flex flex-col gap-2">
        {poll.options.map((opt, i) => {
          const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0;
          const isMyVote = poll.myVote === i;
          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={isPending}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${
                isMyVote
                  ? "border-[var(--color-secondary)] bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-dim)]"
              } disabled:cursor-not-allowed disabled:opacity-70`}
            >
              <div
                className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--color-secondary)] opacity-10 transition-all"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {isMyVote ? (
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--color-secondary)]" />
                  ) : (
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full border border-[var(--color-border)]" />
                  )}
                  {opt.text}
                </span>
                <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">
                  {opt.count} · {pct}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--color-subtle)]">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          {poll.createdByUserId === currentUserId && poll.votes.length > 0 ? (
            <button
              onClick={() => setShowResponses((s) => !s)}
              className="text-xs text-[var(--color-secondary)] hover:underline"
            >
              {showResponses ? "Hide" : "See"} responses
            </button>
          ) : null}
          {poll.createdByUserId === currentUserId ? (
            <button
              onClick={handleClose}
              disabled={isPending}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-50"
            >
              {isPending ? "Closing…" : "Close poll"}
            </button>
          ) : null}
        </div>
      </div>

      {showResponses ? (
        <ResponsesBreakdown poll={poll} />
      ) : null}
    </div>
  );
}

// ── Closed polls section ──────────────────────────────────────────────────────

function ClosedPollsSection({ polls, currentUserId }: { polls: PollData[]; currentUserId: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 py-1 text-xs text-[var(--color-subtle)] hover:text-[var(--color-muted)]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {polls.length} closed poll{polls.length !== 1 ? "s" : ""}
      </button>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-2">
          {polls.map((poll) => (
            <ClosedPollCard key={poll.id} poll={poll} currentUserId={currentUserId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ClosedPollCard({ poll, currentUserId }: { poll: PollData; currentUserId: string }) {
  const [showResponses, setShowResponses] = useState(false);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.count, 0);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-4 opacity-70">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-semibold text-[var(--color-text)]">{poll.question}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-surface-high)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-subtle)]">
          closed
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {poll.options.map((opt, i) => {
          const pct = totalVotes > 0 ? Math.round((opt.count / totalVotes) * 100) : 0;
          const isMyVote = poll.myVote === i;
          return (
            <div key={i} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <span className={`flex-1 ${isMyVote ? "font-semibold text-[var(--color-text)]" : ""}`}>
                {opt.text}
              </span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full rounded-full bg-[var(--color-secondary)] opacity-60"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono">
                {opt.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>

      {poll.createdByUserId === currentUserId && poll.votes.length > 0 ? (
        <button
          onClick={() => setShowResponses((s) => !s)}
          className="mt-3 text-xs text-[var(--color-secondary)] hover:underline"
        >
          {showResponses ? "Hide" : "See"} responses
        </button>
      ) : null}
      {showResponses ? <ResponsesBreakdown poll={poll} /> : null}
    </div>
  );
}

// ── Responses breakdown (creator only) ───────────────────────────────────────

function ResponsesBreakdown({ poll }: { poll: PollData }) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-subtle)]">
        Responses
      </p>
      {poll.options.map((opt, i) => {
        const voters = poll.votes.filter((v) => v.optionIndex === i);
        if (voters.length === 0) return null;
        return (
          <div key={i} className="mb-2 last:mb-0">
            <p className="text-xs font-medium text-[var(--color-muted)]">{opt.text}</p>
            <p className="text-xs text-[var(--color-subtle)]">
              {voters.length} vote{voters.length !== 1 ? "s" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Create poll form ──────────────────────────────────────────────────────────

function CreatePollForm({
  workspaceId,
  meetingId,
  channelId,
  onCancel,
  onCreated,
}: {
  workspaceId: string;
  meetingId?: string;
  channelId?: string;
  onCancel: () => void;
  onCreated: (poll: PollData) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createPoll(fd);
      if (result.error) {
        setError("Failed to create poll. Check that you have at least 2 options.");
        return;
      }
      if (result.poll) {
        formRef.current?.reset();
        onCreated(result.poll);
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[var(--color-secondary-dim)] bg-[var(--color-surface)] p-4"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {meetingId ? <input type="hidden" name="meetingId" value={meetingId} /> : null}
      {channelId ? <input type="hidden" name="channelId" value={channelId} /> : null}

      <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
        New Poll
      </p>

      <div className="flex flex-col gap-2">
        <input
          name="question"
          required
          placeholder="Ask a question…"
          className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-secondary)] placeholder:text-[var(--color-subtle)]"
        />
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            name={`option_${i}`}
            required={i < 2}
            placeholder={i < 2 ? `Option ${i + 1}` : `Option ${i + 1} (optional)`}
            className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-secondary)] placeholder:text-[var(--color-subtle)]"
          />
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-full border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-full bg-[var(--color-secondary)] py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Poll"}
        </button>
      </div>
    </form>
  );
}
