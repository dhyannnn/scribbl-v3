"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markChannelRead } from "@/app/workspaces/[id]/chat/actions";

export function MarkChannelRead({ channelId, workspaceId }: { channelId: string; workspaceId: string }) {
  const router = useRouter();

  useEffect(() => {
    markChannelRead(channelId, workspaceId).then(() => {
      router.refresh();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  return null;
}
