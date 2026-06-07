"use client";

import dynamic from "next/dynamic";

const IncomingCallListener = dynamic(
  () => import("@/components/IncomingCallListener").then((m) => m.IncomingCallListener),
  { ssr: false },
);

export function IncomingCallListenerLoader({ currentUserId }: { currentUserId: string }) {
  return <IncomingCallListener currentUserId={currentUserId} />;
}
