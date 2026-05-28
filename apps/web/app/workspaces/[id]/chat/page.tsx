import { notFound, redirect } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { createChannel } from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chat?: string }>;
};

export default async function ChatIndexPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { chat: chatStatus } = await searchParams;

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      members: {
        where: { userId: currentUser.id, status: "ACTIVE" },
        select: { role: true },
        take: 1,
      },
      channels: {
        where: { type: "CHAT", meetingId: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!workspace) {
    notFound();
  }

  if (workspace.members.length === 0) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  // Always redirect to the first chat channel
  if (workspace.channels.length > 0) {
    redirect(`/workspaces/${id}/chat/${workspace.channels[0].id}`);
  }

  // Edge case: no CHAT channel exists (shouldn't happen in normal usage)
  const canManage = workspace.members[0]?.role === "OWNER" || workspace.members[0]?.role === "ADMIN";

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-[var(--color-bg)] p-8 text-center">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <p className="text-sm font-medium text-[var(--color-muted)]">No channels yet</p>
        <p className="mt-2 text-xs text-[var(--color-subtle)]">This workspace has no chat channels.</p>
        {canManage ? (
          <form action={createChannel} className="mt-6 flex gap-2">
            <input type="hidden" name="workspaceId" value={id} />
            <input
              name="name"
              required
              placeholder="general"
              defaultValue="general"
              className="min-h-9 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none focus:border-[var(--color-secondary)]"
            />
            <PendingSubmitButton
              pendingLabel="Creating..."
              className="rounded-full bg-[var(--color-secondary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
            >
              Create
            </PendingSubmitButton>
          </form>
        ) : null}
        {chatStatus === "deleted" ? (
          <p className="mt-4 text-xs text-[var(--color-muted)]">Channel deleted.</p>
        ) : null}
      </div>
    </div>
  );
}
