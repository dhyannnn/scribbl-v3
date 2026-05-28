import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

type PageProps = {
  params: Promise<{ id: string }>;
};

const PAGE_SIZE = 50;

export default async function AuditLogPage({ params }: PageProps) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) return <ProtectedPageMessage />;

  const [workspace, membership] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, plan: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: currentUser.id } },
      select: { role: true, status: true },
    }),
  ]);

  if (!workspace) notFound();

  if (!membership || membership.status !== "ACTIVE") {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return (
      <ProtectedPageMessage
        title="Audit log is owner and admin only"
        message="Contact your workspace owner to view the audit log."
      />
    );
  }

  if (workspace.plan !== "INSTITUTION" && workspace.plan !== "ENTERPRISE") {
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <div className="mx-auto max-w-[800px] px-8 py-8">
          <header className="mb-8">
            <Link
              href={`/workspaces/${id}`}
              className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
            >
              ← {workspace.name}
            </Link>
            <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">Audit Log</h1>
          </header>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center shadow-sm">
            <p className="font-display text-base font-semibold text-[var(--color-text)]">Institution feature</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Upgrade to Institution to access full audit logs for member changes, billing events, and more.
            </p>
            <Link
              href={`/workspaces/${id}/billing`}
              className="mt-5 inline-block rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-80"
            >
              View billing options
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: id },
    include: {
      actor: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[800px] px-8 py-8">

        <header className="mb-8">
          <Link
            href={`/workspaces/${id}`}
            className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)] lg:text-4xl">
            Audit Log
          </h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            Last {PAGE_SIZE} events for this workspace.
          </p>
        </header>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <p className="text-sm text-[var(--color-subtle)]">No audit events recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <div className="divide-y divide-[var(--color-border)]">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4 px-6 py-4">
                  {/* Timeline dot */}
                  <div className="mt-1.5 flex shrink-0 flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full ${getTimelineDotColor(log.action)}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionBadge action={log.action} />
                      {log.actor ? (
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {log.actor.displayName}
                        </span>
                      ) : (
                        <span className="text-sm text-[var(--color-subtle)]">System</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                      {getActionDescription(log.action, log.metadata, log.actor?.displayName)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <span className="font-mono text-xs text-[var(--color-subtle)]">
                        {log.createdAt.toLocaleString("en-CA", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {log.targetId ? (
                        <span className="font-mono text-xs text-[var(--color-subtle)]">{log.targetId}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: AuditAction }) {
  const { bg, text } = getActionBadgeTokens(action);
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold ${bg} ${text}`}>
      {formatAction(action)}
    </span>
  );
}

function getActionBadgeTokens(action: AuditAction): { bg: string; text: string } {
  if (action === "BILLING_PAYMENT_FAILED" || action === "RECORDING_FAILED") {
    return { bg: "bg-[var(--color-danger-dim)]", text: "text-[var(--color-danger)]" };
  }
  if (action === "BILLING_CANCELED") {
    return { bg: "bg-[var(--color-warning-dim)]", text: "text-[var(--color-warning)]" };
  }
  if (action === "BILLING_UPGRADED" || action.startsWith("RECORDING_")) {
    return { bg: "bg-[var(--color-success-dim)]", text: "text-[var(--color-success)]" };
  }
  if (action.startsWith("MEMBER_") || action.startsWith("OWNERSHIP_")) {
    return { bg: "bg-[var(--color-secondary-dim)]", text: "text-[var(--color-secondary)]" };
  }
  if (action.startsWith("MEETING_")) {
    return { bg: "bg-[var(--color-warning-dim)]", text: "text-[var(--color-warning)]" };
  }
  return { bg: "bg-[var(--color-surface-high)]", text: "text-[var(--color-muted)]" };
}

function getTimelineDotColor(action: AuditAction): string {
  if (action === "BILLING_PAYMENT_FAILED" || action === "RECORDING_FAILED") return "bg-[var(--color-danger)]";
  if (action === "BILLING_UPGRADED" || action.startsWith("RECORDING_")) return "bg-[var(--color-success)]";
  if (action.startsWith("MEMBER_") || action.startsWith("OWNERSHIP_")) return "bg-[var(--color-secondary)]";
  if (action.startsWith("MEETING_")) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-border-strong)]";
}

function formatAction(action: AuditAction): string {
  const labels: Partial<Record<AuditAction, string>> = {
    MEMBER_INVITED: "Member invited",
    MEMBER_INVITE_RESENT: "Invite resent",
    MEMBER_INVITE_REVOKED: "Invite revoked",
    MEMBER_INVITE_ACCEPTED: "Invite accepted",
    MEMBER_REMOVED: "Member removed",
    MEMBER_ROLE_CHANGED: "Role changed",
    OWNERSHIP_TRANSFERRED: "Ownership transferred",
    MEETING_SCHEDULED: "Meeting scheduled",
    MEETING_UPDATED: "Meeting updated",
    MEETING_CANCELED: "Meeting canceled",
    RECORDING_STARTED: "Recording started",
    RECORDING_STOPPED: "Recording stopped",
    RECORDING_COMPLETED: "Recording completed",
    RECORDING_FAILED: "Recording failed",
    NOTE_DELETED: "Note deleted",
    FILE_DELETED: "File deleted",
    ACCOUNT_DELETED: "Account deleted",
    BILLING_UPGRADED: "Plan upgraded",
    BILLING_CANCELED: "Plan canceled",
    BILLING_PAYMENT_FAILED: "Payment failed",
  };
  return labels[action] ?? action;
}

function getActionDescription(
  action: AuditAction,
  metadata: unknown,
  actorName?: string,
): string {
  const m = metadata as Record<string, string> | null;
  switch (action) {
    case "MEMBER_INVITED":
      return `${actorName ?? "Someone"} invited ${m?.email ?? "a member"} as ${m?.role?.toLowerCase() ?? "member"}`;
    case "MEMBER_REMOVED":
      return `${actorName ?? "Someone"} removed a member from the workspace`;
    case "MEMBER_ROLE_CHANGED":
      return `${actorName ?? "Someone"} changed a member's role to ${m?.newRole?.toLowerCase() ?? "unknown"}`;
    case "OWNERSHIP_TRANSFERRED":
      return `Workspace ownership transferred to a new owner`;
    case "MEETING_SCHEDULED":
      return `${actorName ?? "Someone"} scheduled a meeting`;
    case "MEETING_CANCELED":
      return `${actorName ?? "Someone"} canceled a meeting`;
    case "RECORDING_STARTED":
      return `${actorName ?? "Someone"} started a recording`;
    case "RECORDING_COMPLETED":
      return `Recording saved to workspace files`;
    case "RECORDING_FAILED":
      return `Recording failed to complete`;
    case "NOTE_DELETED":
      return `${actorName ?? "Someone"} deleted a note`;
    case "FILE_DELETED":
      return `${actorName ?? "Someone"} deleted a file`;
    case "BILLING_UPGRADED":
      return `Workspace upgraded from ${m?.oldPlan ?? "Free"} to ${m?.newPlan ?? "Pro"}${m?.source === "manual_sync" ? " (manual sync)" : ""}`;
    case "BILLING_CANCELED":
      return `Subscription canceled — workspace reverted to Free plan`;
    case "BILLING_PAYMENT_FAILED":
      return `Payment failed — workspace is in past due state`;
    default:
      return action.toLowerCase().replaceAll("_", " ");
  }
}
