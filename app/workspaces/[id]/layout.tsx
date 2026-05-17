import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const { id } = await params;

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <WorkspaceSidebar workspaceId={id} />
      <main className="flex-1 pl-64 min-w-0">
        {children}
      </main>
    </div>
  );
}
