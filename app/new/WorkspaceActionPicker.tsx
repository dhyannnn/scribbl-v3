import Link from "next/link";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

type WorkspaceActionPickerProps = {
  actionLabel: string;
  description: string;
  emptyMessage: string;
  getHref: (workspaceId: string) => string;
  title: string;
};

export async function WorkspaceActionPicker({
  actionLabel,
  description,
  emptyMessage,
  getHref,
  title,
}: WorkspaceActionPickerProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return (
      <ProtectedPageMessage
        title="Sign in to continue"
        message="Use your Scribbl account to choose a workspace."
      />
    );
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: currentUser.id, status: "ACTIVE" },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          _count: {
            select: {
              members: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const workspaces = memberships.map((membership) => ({
    ...membership.workspace,
    role: membership.role,
  }));

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] w-full max-w-[980px] flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href="/"
          className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)] hover:underline"
        >
          Back to dashboard
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-muted)]">
          {description}
        </p>
      </div>

      {workspaces.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={getHref(workspace.id)}
              className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--color-secondary)] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">
                    {workspace.type.toLowerCase()} · {workspace.role.toLowerCase()}
                  </p>
                  <h2 className="mt-2 truncate font-display text-xl font-bold text-[var(--color-text)]">
                    {workspace.name}
                  </h2>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-sm font-bold text-[var(--color-secondary)]">
                  {getWorkspaceInitials(workspace.name)}
                </span>
              </div>

              {workspace.description ? (
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-muted)]">
                  {workspace.description}
                </p>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
                <span className="text-xs font-medium text-[var(--color-subtle)]">
                  {workspace._count.members} member{workspace._count.members !== 1 ? "s" : ""}
                </span>
                <span className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-bold text-white transition group-hover:bg-[var(--color-secondary)]">
                  {actionLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
          <h2 className="font-display text-2xl font-bold text-[var(--color-text)]">No workspaces yet</h2>
          <p className="mx-auto mt-3 max-w-md leading-7 text-[var(--color-muted)]">{emptyMessage}</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-bold text-white transition hover:opacity-80"
          >
            Create a workspace
          </Link>
        </section>
      )}
    </div>
  );
}

function getWorkspaceInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "W";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
