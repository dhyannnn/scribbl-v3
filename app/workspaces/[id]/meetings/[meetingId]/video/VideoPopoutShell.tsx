"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeetingVideoRoom } from "./MeetingVideoRoom";

type VideoPopoutShellProps = {
  workspaceId: string;
  meetingId: string;
  meetingTitle: string;
  workspaceName: string;
  lifecycleLabel: string;
  hubHref: string;
  disabled: boolean;
};

type VideoChannelMessage =
  | { type: "popout-ready" }
  | { type: "popout-closed" }
  | { type: "bring-back" }
  | { type: "focus-hub"; hash: string };

export function VideoPopoutShell({
  workspaceId,
  meetingId,
  meetingTitle,
  workspaceName,
  lifecycleLabel,
  hubHref,
  disabled,
}: VideoPopoutShellProps) {
  const router = useRouter();
  const [isReturning, setIsReturning] = useState(false);
  const [wasOpenedByHub, setWasOpenedByHub] = useState(false);
  const wasOpenedByHubRef = useRef(false);
  const channelName = useMemo(() => `scribbl-video-${meetingId}`, [meetingId]);

  const closeToHub = useCallback(
    (channel?: BroadcastChannel, openedByHub = wasOpenedByHubRef.current) => {
      const activeChannel = channel ?? new BroadcastChannel(channelName);
      activeChannel.postMessage({ type: "bring-back" } satisfies VideoChannelMessage);
      setIsReturning(true);

      if (openedByHub) {
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

  function focusHubSection(hash: string) {
    const channel = new BroadcastChannel(channelName);

    channel.postMessage({ type: "focus-hub", hash } satisfies VideoChannelMessage);
    window.opener?.focus();
    window.setTimeout(() => channel.close(), 150);
  }

  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    const openedByHub = Boolean(window.opener);

    wasOpenedByHubRef.current = openedByHub;
    window.setTimeout(() => setWasOpenedByHub(openedByHub), 0);

    if (openedByHub) {
      channel.postMessage({ type: "popout-ready" } satisfies VideoChannelMessage);
    }

    channel.onmessage = (event: MessageEvent<VideoChannelMessage>) => {
      if (event.data.type === "bring-back" && openedByHub) {
        closeToHub(channel, openedByHub);
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
  }, [channelName, closeToHub]);

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
          <div className="flex flex-wrap gap-2 text-sm">
            {wasOpenedByHub ? (
              <>
                <button
                  type="button"
                  onClick={() => focusHubSection("#meeting-notes")}
                  className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
                >
                  Open Notes
                </button>
                <button
                  type="button"
                  onClick={() => focusHubSection("#meeting-chat")}
                  className="rounded-md border border-white/15 bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
                >
                  Open Chat
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </header>

        {disabled ? (
          <p className="rounded-md border border-[#ead1cd] bg-[#fff7f5] px-4 py-3 text-sm text-[#7a3434]">
            Video opens 10 minutes before the scheduled start and closes when the meeting ends or is canceled.
          </p>
        ) : null}

        {isReturning ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-md border border-white/10 bg-[#20201d] p-6 text-center">
            <p className="text-sm font-medium text-white/70">Returning video to the meeting hub...</p>
          </div>
        ) : (
          <MeetingVideoRoom workspaceId={workspaceId} meetingId={meetingId} disabled={disabled} />
        )}
      </div>
    </main>
  );
}
