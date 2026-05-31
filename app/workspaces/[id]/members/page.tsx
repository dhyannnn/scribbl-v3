"use server";

import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { StatusDot } from "@/components/StatusPickerAvatar";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  getIncludedMemberLimit,
  getMemberOverageRateCad,
} from "@/lib/billing";
import {
  addWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
} from "../actions";
import { findOrCreateDmChannel } from "../chat/actions";

type MembersPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
};

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const { id } = await params;
  const { invite: inviteStatus } = await searchParams;

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: "ACTIVE" },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
        invites: {
          where: { status: "PENDING", expiresAt: { gt: new Date() } },
          include: { invitedBy: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  ]);

  if (!workspace) notFound();
  if (!currentUser) return <ProtectedPageMessage />;

  const currentMembership = workspace.members.find((m) => m.userId === currentUser.id);
  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const canManageMembers = currentMembership.role === "OWNER";
  const activeMemberCount = workspace.members.length;
  const includedMemberLimit = getIncludedMemberLimit(workspace.plan);
  const overageMemberCount = workspace.plan !== "FREE" && isFinite(includedMemberLimit)
    ? Math.max(0, activeMemberCount - includedMemberLimit)
    : 0;
  const overageRateCAD = getMemberOverageRateCad(workspace.plan);

  const nonOwnerMembers = workspace.members.filter((m) => m.role !== "OWNER");

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-[860px] px-6 py-10">

        {/* Header */}
        <header className="mb-8">
          <Link
            href={`/workspaces/${workspace.id}`}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)] transition hover:text-[var(--color-secondary)]"
          >
            ← {workspace.name}
          </Link>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold text-[var(--color-text)]">Members</h1>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {activeMemberCount} active member{activeMemberCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <div className="text-center">
                <p className="font-display text-3xl font-bold text-[var(--color-text)]">{activeMemberCount}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-subtle)]">Active</p>
              </div>
              {workspace.invites.length > 0 ? (
                <div className="text-center">
                  <p className="font-display text-3xl font-bold text-[var(--color-secondary)]">{workspace.invites.length}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-subtle)]">Pending</p>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Overage notice */}
        {overageMemberCount > 0 && canManageMembers ? (
          <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-5 py-4 text-sm text-[var(--color-muted)]">
            <span className="font-semibold text-[var(--color-text)]">
              {overageMemberCount} member{overageMemberCount > 1 ? "s" : ""} on overage
            </span>
            {" "}· {activeMemberCount} total, {includedMemberLimit} included ·{" "}
            <span className="font-medium text-[var(--color-text)]">
              ~${(overageMemberCount * overageRateCAD).toFixed(2)} CAD extra on next invoice
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-6">

          {/* Invite form */}
          {canManageMembers ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Invite a member</h2>

              {inviteStatus === "plan-limit" ? (
                <div className="mt-3 rounded-xl bg-[var(--color-warning-dim)] px-4 py-3">
                  <p className="text-sm font-medium text-[var(--color-warning)]">
                    Member limit reached.{" "}
                    <Link href={`/workspaces/${workspace.id}/billing`} className="underline hover:no-underline">
                      Upgrade to Pro →
                    </Link>
                  </p>
                </div>
              ) : getInviteStatusMessage(inviteStatus) ? (
                <p className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
                  {getInviteStatusMessage(inviteStatus)}
                </p>
              ) : null}

              <form action={addWorkspaceMember} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: "200px" }}>
                  <span className="text-xs font-medium text-[var(--color-muted)]">Email address</span>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="avery@example.com"
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Role</span>
                  <select
                    name="role"
                    defaultValue="MEMBER"
                    className="min-h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)]"
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>
                <PendingSubmitButton
                  pendingLabel="Sending..."
                  className="min-h-10 rounded-full bg-[var(--color-secondary)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)] disabled:opacity-50"
                >
                  Send invite
                </PendingSubmitButton>
              </form>
            </div>
          ) : null}

          {/* Active members */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
              <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Active Members</h2>
              {!canManageMembers ? (
                <p className="text-xs text-[var(--color-subtle)]">Only the owner can manage members.</p>
              ) : null}
            </div>

            <div className="divide-y divide-[var(--color-border)]">
              {workspace.members.length === 1 && canManageMembers ? (
                <p className="px-6 py-5 text-sm text-[var(--color-muted)]">
                  You&apos;re the only member. Use the invite form above to bring in teammates.
                </p>
              ) : null}

              {workspace.members.map((member) => {
                const isCurrentUser = member.userId === currentUser.id;
                return (
                  <div key={member.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-4">

                    {/* Avatar + info */}
                    <Link href={`/profile/${member.userId}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition hover:opacity-75">
                      <div className="relative shrink-0">
                        {member.user.avatarUrl ? (
                          <img
                            src={member.user.avatarUrl}
                            alt={member.user.displayName}
                            className="h-10 w-10 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] font-mono text-sm font-semibold text-[var(--color-secondary)]">
                            {getInitials(member.user.displayName)}
                          </div>
                        )}
                        <StatusDot status={member.user.status} className="absolute bottom-0 right-0" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-[var(--color-text)]">{member.user.displayName}</p>
                          {isCurrentUser ? (
                            <span className="shrink-0 rounded-full bg-[var(--color-surface-high)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-subtle)]">you</span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-[var(--color-subtle)]">{member.user.email}</p>
                      </div>
                    </Link>

                    {/* Role — editable for owner managing non-owners, badge otherwise */}
                    <div className="shrink-0 pl-13 sm:pl-0">
                      {canManageMembers && member.role !== "OWNER" ? (
                        <form action={updateWorkspaceMemberRole} className="flex items-center gap-2">
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <select
                            name="role"
                            defaultValue={member.role}
                            className="min-h-8 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-3 text-xs font-medium text-[var(--color-text)] outline-none transition focus:border-[var(--color-secondary)]"
                          >
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                          <PendingSubmitButton
                            pendingLabel="..."
                            className="min-h-8 rounded-full border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                          >
                            Save
                          </PendingSubmitButton>
                        </form>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2 pl-13 sm:pl-0">
                      {!isCurrentUser ? (
                        <form action={findOrCreateDmChannel}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="otherUserId" value={member.userId} />
                          <PendingSubmitButton
                            pendingLabel="..."
                            className="min-h-8 rounded-full border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                          >
                            Message
                          </PendingSubmitButton>
                        </form>
                      ) : null}

                      {canManageMembers && member.role !== "OWNER" ? (
                        <form action={removeWorkspaceMember}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="memberId" value={member.id} />
                          <PendingSubmitButton
                            pendingLabel="..."
                            className="min-h-8 rounded-full border border-[var(--color-danger-dim)] bg-[var(--color-danger-dim)] px-3 text-xs font-medium text-[var(--color-danger)] transition hover:bg-[var(--color-danger)] hover:text-white disabled:opacity-50"
                          >
                            Remove
                          </PendingSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending invites */}
          {canManageMembers ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
              <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-6 py-4">
                <h2 className="font-display text-base font-semibold text-[var(--color-text)]">Pending Invites</h2>
                <span className="rounded-full bg-[var(--color-surface-high)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-muted)]">
                  {workspace.invites.length}
                </span>
              </div>

              {workspace.invites.length > 0 ? (
                <div className="divide-y divide-[var(--color-border)]">
                  {workspace.invites.map((invite) => (
                    <div key={invite.id} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-text)]">{invite.email}</p>
                        <p className="mt-0.5 text-xs text-[var(--color-subtle)]">
                          {invite.role.toLowerCase()} · invited by {invite.invitedBy.displayName} · expires{" "}
                          {invite.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <p className="mt-1.5 break-all rounded-lg bg-[var(--color-surface-low)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)]">
                          {`/invites/${invite.token}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <form action={resendWorkspaceInvite}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <PendingSubmitButton
                            pendingLabel="Sending..."
                            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] disabled:opacity-50"
                          >
                            Resend Email
                          </PendingSubmitButton>
                        </form>
                        <form action={revokeWorkspaceInvite}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <PendingSubmitButton
                            pendingLabel="Revoking..."
                            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-danger)] transition hover:border-[var(--color-danger)] hover:bg-[var(--color-danger-dim)] disabled:opacity-50"
                          >
                            Revoke
                          </PendingSubmitButton>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-6 py-5 text-sm text-[var(--color-subtle)]">
                  Invites for people who haven&apos;t joined yet will appear here.
                </p>
              )}
            </div>
          ) : null}

          {/* Danger zone — transfer ownership (owner only, only if there are non-owners) */}
          {canManageMembers && nonOwnerMembers.length > 0 ? (
            <div className="rounded-2xl border border-[var(--color-danger-dim)] bg-[var(--color-surface)] shadow-sm">
              <div className="border-b border-[var(--color-danger-dim)] px-6 py-4">
                <h2 className="font-display text-base font-semibold text-[var(--color-danger)]">Danger zone</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">These actions are permanent and cannot be undone.</p>
              </div>
              <div className="px-6 py-5">
                <p className="text-sm font-semibold text-[var(--color-text)]">Transfer workspace ownership</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  The new owner gains full control. You will become a member with your current role.
                </p>
                <form action={transferWorkspaceOwnership} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--color-muted)]">Transfer to</span>
                    <select
                      name="memberId"
                      className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-danger)]"
                    >
                      {nonOwnerMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.user.displayName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--color-muted)]">Type TRANSFER to confirm</span>
                    <input
                      name="confirmation"
                      required
                      pattern="TRANSFER"
                      placeholder="TRANSFER"
                      className="min-h-9 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-danger)]"
                    />
                  </label>
                  <PendingSubmitButton
                    pendingLabel="Transferring..."
                    className="min-h-9 rounded-full border border-[var(--color-danger)] px-4 text-sm font-semibold text-[var(--color-danger)] transition hover:bg-[var(--color-danger)] hover:text-white disabled:opacity-50"
                  >
                    Transfer Ownership
                  </PendingSubmitButton>
                </form>
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === "OWNER") {
    return (
      <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-on-primary)]">
        owner
      </span>
    );
  }
  if (role === "ADMIN") {
    return (
      <span className="rounded-full bg-[var(--color-secondary-dim)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-secondary)]">
        admin
      </span>
    );
  }
  return (
    <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
      member
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getInviteStatusMessage(status?: string) {
  switch (status) {
    case "sent": return "Invite saved and email sent.";
    case "email-not-configured": return "Invite link saved. Add RESEND_API_KEY and EMAIL_FROM to send invite emails.";
    case "email-failed": return "Invite link saved, but the email could not be sent. Try resending it.";
    case "invalid": return "Enter a valid email address and role.";
    case "unauthorized": return "Only the workspace owner can invite members.";
    case "plan-limit": return "This workspace is on the Free plan (max 3 members). Upgrade to Pro to invite more.";
    case "already-member": return "That email is already an active member of this workspace.";
    case "member-removed": return "Member removed from the workspace.";
    case "role-updated": return "Member role updated.";
    case "invalid-role": return "Choose a valid member role.";
    case "owner-role": return "Owner roles cannot be changed here.";
    case "ownership-transferred": return "Ownership transferred successfully.";
    case "invalid-transfer-confirmation": return "Type TRANSFER exactly to confirm.";
    case "cannot-transfer-to-owner": return "Choose an active non-owner member to receive ownership.";
    default: return null;
  }
}
