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

  if (workspace.plan !== "INSTITUTION") {
    return (
      <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
          <header className="border-b border-[#d8d8ce] pb-6">
            <Link href={`/workspaces/${id}`} className="text-sm font-medium text-[#2f604b]">
              Back to {workspace.name}
            </Link>
            <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Audit Log</h1>
          </header>
          <div className="rounded-md border border-[#d8d8ce] bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-[#20201d]">Audit log is an Institution feature</p>
            <p className="mt-2 text-sm text-[#66685f]">
              Upgrade to Institution to access full audit logs for member changes, billing events, and more.
            </p>
            <Link
              href={`/workspaces/${id}/billing`}
              className="mt-5 inline-block rounded-md bg-[#2f604b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244b3a]"
            >
              View billing options
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const logs = await prisma.auditLog.findMany({
    where: { workspaceId: id },
    include: {
      actor: {
        select: { displayName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${id}`} className="text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <h1 className="mt-4 text-2xl font-semibold sm:text-3xl lg:text-4xl">Audit Log</h1>
          <p className="mt-3 text-base leading-7 text-[#62645c]">
            Last {PAGE_SIZE} events for this workspace.
          </p>
        </header>

        {logs.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#c8c8bd] bg-white p-8 text-center text-sm text-[#66685f]">
            No audit events recorded yet.
          </div>
        ) : (
          <div className="rounded-md border border-[#d8d8ce] bg-white shadow-sm">
            <div className="divide-y divide-[#f1f1eb]">
              {logs.map((log) => (
                <div key={log.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-start sm:gap-6">
                  <div className="shrink-0 text-xs text-[#777970] sm:w-36">
                    {log.createdAt.toLocaleString("en-CA", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
                        {formatAction(log.action)}
                      </span>
                      {log.actor ? (
                        <span className="text-sm text-[#4d4f47]">{log.actor.displayName}</span>
                      ) : (
                        <span className="text-sm text-[#777970]">System</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[#66685f]">
                      {getActionDescription(log.action, log.metadata, log.actor?.displayName)}
                    </p>
                    {log.targetId ? (
                      <p className="mt-0.5 font-mono text-xs text-[#9a9b94]">{log.targetId}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
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

function getActionBadgeClass(action: AuditAction): string {
  if (action.startsWith("BILLING_")) {
    if (action === "BILLING_PAYMENT_FAILED") return "bg-[#fdecea] text-[#b65b5b]";
    if (action === "BILLING_CANCELED") return "bg-[#fff3d8] text-[#7a5a1f]";
    return "bg-[#e7eee7] text-[#2f604b]";
  }
  if (action.startsWith("RECORDING_FAILED")) return "bg-[#fdecea] text-[#b65b5b]";
  if (action.startsWith("RECORDING_")) return "bg-[#e7eee7] text-[#2f604b]";
  if (action.startsWith("MEMBER_") || action.startsWith("OWNERSHIP_")) return "bg-[#eeeef9] text-[#4a4a8a]";
  if (action.startsWith("MEETING_")) return "bg-[#fff3d8] text-[#7a5a1f]";
  return "bg-[#f1f1eb] text-[#66685f]";
}
