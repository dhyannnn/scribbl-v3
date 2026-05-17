import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <AppSidebar />
      <main className="flex-1 pl-64 min-w-0">
        {children}
      </main>
    </div>
  );
}
