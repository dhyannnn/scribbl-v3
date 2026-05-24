import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { ActiveMeetingProvider } from "@/components/ActiveMeetingContext";
import { WorkspaceVideoOverlay } from "./WorkspaceVideoOverlay";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { id } = await params;

  return (
    <ActiveMeetingProvider>
      <WorkspaceSidebarShell sidebar={<WorkspaceSidebar workspaceId={id} />}>
        {children}
      </WorkspaceSidebarShell>
      <WorkspaceVideoOverlay />
    </ActiveMeetingProvider>
  );
}
