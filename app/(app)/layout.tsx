import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <AppSidebar />
      <main className="min-w-0 flex-1 pb-24 pt-16 lg:pb-0 lg:pt-0 lg:pl-64">
        {children}
      </main>
    </div>
  );
}
