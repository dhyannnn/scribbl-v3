import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { IncomingCallListener } from "@/components/IncomingCallListener";
import { getCurrentUser } from "@/lib/current-user";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  return (
    <WorkspaceSidebarShell sidebar={<WorkspaceSidebar workspaceId={id} />}>
      {children}
      {currentUser ? <IncomingCallListener currentUserId={currentUser.id} /> : null}
    </WorkspaceSidebarShell>
  );
}
