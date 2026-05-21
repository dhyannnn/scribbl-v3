import { WorkspaceActionPicker } from "@/app/new/WorkspaceActionPicker";

export default function NewFilePage() {
  return (
    <WorkspaceActionPicker
      title="Choose a workspace for this file"
      description="Files are stored inside a workspace so storage limits, access, pinned files, and meeting artifacts stay organized."
      actionLabel="Open files"
      emptyMessage="Create a workspace first, then you can upload files to it."
      getHref={(workspaceId) => `/workspaces/${workspaceId}/files`}
    />
  );
}
