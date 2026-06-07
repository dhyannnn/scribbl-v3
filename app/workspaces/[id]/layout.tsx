import dynamic from "next/dynamic";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { WorkspaceSidebarShell } from "@/components/WorkspaceSidebarShell";
import { getCurrentUser } from "@/lib/current-user";

const IncomingCallListener = dynamic(
  () => import("@/components/IncomingCallListener").then((m) => m.IncomingCallListener),
  { ssr: false },
);

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
