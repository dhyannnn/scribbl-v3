"use client";

import { useOthers, useSelf, useStatus } from "@liveblocks/react/suspense";

type UserInfo = {
  name?: string;
  email?: string;
};

export function PresenceBar() {
  const self = useSelf();
  const others = useOthers();
  const status = useStatus();
  const collaborators = [
    self
      ? {
          id: self.id,
          name: getDisplayName(self.info),
          isSelf: true,
        }
      : null,
    ...others.map((other) => ({
      id: other.id,
      name: getDisplayName(other.info),
      isSelf: false,
    })),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[#d8d8ce] bg-white p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-[#20201d]">Live collaboration</p>
        <p className="mt-1 text-xs text-[#66685f]">{getStatusText(status, others.length)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {collaborators.map((user, index) =>
          user ? (
            <div
              key={`${user.id}-${user.isSelf ? "self" : "other"}-${index}`}
              className="flex items-center gap-2 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 py-1.5"
              title={user.isSelf ? `${user.name} (you)` : user.name}
            >
              <span className="grid size-6 place-items-center rounded-full bg-[#2f604b] text-xs font-semibold text-white">
                {getInitials(user.name)}
              </span>
              <span className="text-xs font-medium text-[#4d4f47]">
                {user.name}
                {user.isSelf ? " (you)" : ""}
              </span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

function getDisplayName(info: UserInfo | undefined) {
  return info?.name || info?.email || "Collaborator";
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function getStatusText(status: string, otherCount: number) {
  if (status === "connected") {
    return otherCount === 0
      ? "Only you are here right now."
      : `${otherCount} other ${otherCount === 1 ? "editor" : "editors"} online.`;
  }

  if (status === "connecting" || status === "reconnecting") {
    return "Connecting to the live room...";
  }

  return "Live presence is currently offline.";
}
