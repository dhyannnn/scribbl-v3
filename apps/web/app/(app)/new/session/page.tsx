export const dynamic = "force-dynamic";

import { WorkspaceActionPicker } from "@/app/new/WorkspaceActionPicker";

export default function NewSessionPage() {
  return (
    <WorkspaceActionPicker
      title="Choose a workspace for this session"
      description="Sessions are scheduled inside a workspace so the meeting hub, notes, chat, files, and recordings stay together."
      actionLabel="Schedule"
      emptyMessage="Create a workspace first, then you can schedule sessions for that team or project."
      getHref={(workspaceId) => `/workspaces/${workspaceId}/meetings`}
    />
  );
}
