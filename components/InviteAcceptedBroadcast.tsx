"use client";

import { useEffect } from "react";
import { publishScribblClientEvent } from "@/app/Providers";

export function InviteAcceptedBroadcast({ href }: { href: string }) {
  useEffect(() => {
    publishScribblClientEvent({
      type: "invite-accepted",
      href,
    });
  }, [href]);

  return null;
}
