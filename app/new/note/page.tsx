import { WorkspaceActionPicker } from "@/app/new/WorkspaceActionPicker";

export default function NewNotePage() {
  return (
    <WorkspaceActionPicker
      title="Choose a workspace for this note"
      description="Notes belong to a workspace so collaborators, files, meetings, and permissions stay connected."
      actionLabel="Open notes"
      emptyMessage="Create a workspace first, then you can add collaborative notes to it."
      getHref={(workspaceId) => `/workspaces/${workspaceId}/notes`}
    />
  );
}
