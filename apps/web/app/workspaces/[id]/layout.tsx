import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { id } = await params;

  return (
    <WorkspaceSidebarShell sidebar={<WorkspaceSidebar workspaceId={id} />}>
      {children}
    </WorkspaceSidebarShell>
  );
}
