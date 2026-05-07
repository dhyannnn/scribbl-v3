import Link from "next/link";
import { notFound } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { ProtectedPageMessage } from "@/components/ProtectedPageMessage";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  addWorkspaceMember,
  removeWorkspaceMember,
  resendWorkspaceInvite,
  revokeWorkspaceInvite,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
} from "../actions";

type MembersPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{ invite?: string }>;
};

export default async function MembersPage({ params, searchParams }: MembersPageProps) {
  const { id } = await params;
  const { invite: inviteStatus } = await searchParams;

  const [currentUser, workspace] = await Promise.all([
    getCurrentUser(),
    prisma.workspace.findUnique({
      where: {
        id,
      },
      include: {
        members: {
          where: {
            status: "ACTIVE",
          },
          include: {
            user: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        invites: {
          where: {
            status: "PENDING",
            expiresAt: {
              gt: new Date(),
            },
          },
          include: {
            invitedBy: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    }),
  ]);

  if (!workspace) {
    notFound();
  }

  if (!currentUser) {
    return <ProtectedPageMessage />;
  }

  const currentMembership = workspace.members.find((member) => member.userId === currentUser.id);

  if (!currentMembership) {
    return (
      <ProtectedPageMessage
        title="You do not have access"
        message="Ask the workspace owner to add the email address on your Scribbl account."
      />
    );
  }

  const canManageMembers = currentMembership?.role === "OWNER";

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href={`/workspaces/${workspace.id}`} className="text-sm font-medium text-[#2f604b]">
            Back to {workspace.name}
          </Link>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#6d7f70]">
                workspace members
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[#171713]">
                Members
              </h1>
              <p className="mt-3 text-base leading-7 text-[#62645c]">
                {workspace.members.length} active member{workspace.members.length === 1 ? "" : "s"} in {workspace.name}.
              </p>
            </div>
            <div className="rounded-md border border-[#d8d8ce] bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-xs font-medium text-[#686a62]">Active Members</p>
              <p className="mt-1 text-2xl font-semibold">{workspace.members.length}</p>
            </div>
          </div>
        </header>

        {canManageMembers ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Invite Member</h2>
            {getInviteStatusMessage(inviteStatus) ? (
              <p className="mt-3 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] px-3 py-2 text-sm text-[#4d4f47]">
                {getInviteStatusMessage(inviteStatus)}
              </p>
            ) : null}
            <form action={addWorkspaceMember} className="mt-5 grid gap-4 lg:grid-cols-[1fr_180px_auto]">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="avery@example.edu"
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Role</span>
                <select
                  name="role"
                  defaultValue="MEMBER"
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-[#fbfbf8] px-3 text-sm outline-none transition focus:border-[#2f604b] focus:bg-white"
                >
                  <option value="MEMBER">Member</option>
                  <option value="TUTOR">Tutor</option>
                  <option value="PROFESSOR">Professor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <div className="flex items-end">
                <PendingSubmitButton
                  pendingLabel="Inviting..."
                  className="min-h-11 w-full rounded-md bg-[#2f604b] px-5 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
                >
                  Invite
                </PendingSubmitButton>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">Active Members</h2>
            {!canManageMembers ? (
              <p className="text-sm text-[#66685f]">Only the workspace owner can manage members.</p>
            ) : null}
          </div>
          <div className="mt-5 grid gap-3">
            {workspace.members.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 border-b border-[#e6e6dc] pb-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{member.user.displayName}</p>
                  <p className="text-sm text-[#777970]">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageMembers && member.role !== "OWNER" ? (
                    <form action={updateWorkspaceMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        className="min-h-8 rounded-md border border-[#c8c8bd] bg-white px-2 text-xs font-medium text-[#2f604b] outline-none transition focus:border-[#2f604b]"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="TUTOR">Tutor</option>
                        <option value="PROFESSOR">Professor</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <PendingSubmitButton
                        pendingLabel="Saving..."
                        className="rounded-md border border-[#c8c8bd] px-3 py-1 text-xs font-medium text-[#2f604b] transition hover:border-[#2f604b] hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save Role
                      </PendingSubmitButton>
                    </form>
                  ) : (
                    <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-xs font-medium text-[#2f604b]">
                      {member.role.toLowerCase()}
                    </span>
                  )}
                  {canManageMembers && member.role !== "OWNER" ? (
                    <form action={removeWorkspaceMember}>
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <input type="hidden" name="memberId" value={member.id} />
                      <PendingSubmitButton
                        pendingLabel="Removing..."
                        className="rounded-md border border-[#c8c8bd] px-3 py-1 text-xs font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </PendingSubmitButton>
                    </form>
                  ) : null}
                </div>
                {canManageMembers && member.role !== "OWNER" ? (
                  <form
                    action={transferWorkspaceOwnership}
                    className="grid gap-2 rounded-md border border-[#ead1cd] bg-[#fff7f5] p-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                  >
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="memberId" value={member.id} />
                    <label className="grid min-w-0 gap-1">
                      <span className="text-xs font-medium text-[#7a3434]">
                        Type TRANSFER to make {member.user.displayName} the owner
                      </span>
                      <input
                        name="confirmation"
                        required
                        pattern="TRANSFER"
                        className="min-h-9 min-w-0 rounded-md border border-[#d8b8b2] bg-white px-3 text-xs outline-none transition focus:border-[#8a3328]"
                      />
                    </label>
                    <PendingSubmitButton
                      pendingLabel="Transferring..."
                      className="min-h-9 rounded-md border border-[#b65b5b] px-3 text-xs font-medium text-[#7a3434] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Transfer Ownership
                    </PendingSubmitButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {canManageMembers ? (
          <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Pending Invites</h2>
              <span className="rounded-md bg-[#e7eee7] px-3 py-1 text-sm font-medium text-[#2f604b]">
                {workspace.invites.length}
              </span>
            </div>
            {workspace.invites.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {workspace.invites.map((invite) => {
                  const invitePath = `/invites/${invite.token}`;

                  return (
                    <div
                      key={invite.id}
                      className="grid gap-3 border-b border-[#e6e6dc] pb-4 last:border-0 lg:grid-cols-[1fr_auto] lg:items-center"
                    >
                      <div>
                        <p className="font-medium">{invite.email}</p>
                        <p className="mt-1 text-sm text-[#777970]">
                          {invite.role.toLowerCase()} / invited by {invite.invitedBy.displayName} / expires{" "}
                          {invite.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <p className="mt-2 break-all rounded-md bg-[#fbfbf8] px-3 py-2 text-xs text-[#4d4f47]">
                          {invitePath}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <form action={resendWorkspaceInvite}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <PendingSubmitButton
                            pendingLabel="Sending..."
                            className="rounded-md border border-[#c8c8bd] px-3 py-2 text-xs font-medium text-[#2f604b] transition hover:border-[#2f604b] hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Resend Email
                          </PendingSubmitButton>
                        </form>
                        <form action={revokeWorkspaceInvite}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <PendingSubmitButton
                            pendingLabel="Revoking..."
                            className="rounded-md border border-[#c8c8bd] px-3 py-2 text-xs font-medium text-[#7a3434] transition hover:border-[#b65b5b] hover:bg-[#fff7f5] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Revoke
                          </PendingSubmitButton>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-md border border-dashed border-[#c8c8bd] bg-[#fbfbf8] p-5 text-sm text-[#66685f]">
                Invites for people who have not joined Scribbl yet will show up here.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function getInviteStatusMessage(status?: string) {
  switch (status) {
    case "sent":
      return "Invite saved and email sent.";
    case "email-not-configured":
      return "Invite link saved. Add RESEND_API_KEY and EMAIL_FROM to send invite emails.";
    case "email-failed":
      return "Invite link saved, but the email could not be sent. Try resending it in a moment.";
    case "invalid":
      return "Enter a valid email address and role.";
    case "unauthorized":
      return "Only the workspace owner can invite members.";
    case "already-member":
      return "That email is already an active member of this workspace.";
    case "member-removed":
      return "Member removed from the workspace.";
    case "role-updated":
      return "Member role updated.";
    case "invalid-role":
      return "Choose a valid member role.";
    case "owner-role-locked":
      return "Owner roles cannot be changed here.";
    case "owner-removal-locked":
      return "Owners cannot be removed from this page.";
    case "last-owner":
      return "A workspace must keep at least one owner.";
    case "transfer-confirmation-required":
      return "Type TRANSFER to confirm ownership transfer.";
    case "transfer-invalid":
      return "Choose an active non-owner member to receive ownership.";
    case "ownership-transferred":
      return "Workspace ownership transferred.";
    default:
      return null;
  }
}
