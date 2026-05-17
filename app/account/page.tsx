import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { getCurrentUser } from "@/lib/current-user";
import { notificationPreferenceDefaults } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { updateNotificationPreferences } from "@/app/notifications/actions";
import { AccountAvatarUploader } from "./AccountAvatarUploader";
import { deleteAccount, updateAccountPassword, updateAccountProfile } from "./actions";

type AccountPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const [{ message }, currentUser] = await Promise.all([searchParams, getCurrentUser()]);

  if (!currentUser) {
    redirect("/login?next=/account");
  }

  const ownedWorkspaces = await prisma.workspaceMember.findMany({
    where: {
      userId: currentUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const notificationPreference = await prisma.notificationPreference.findUnique({
    where: {
      userId: currentUser.id,
    },
  });
  const canDeleteAccount = ownedWorkspaces.length === 0;

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href="/" className="text-sm font-medium text-[#2f604b]">
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal text-[#171713] sm:text-3xl lg:text-4xl">Account</h1>
        </header>

        {message ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white p-3 text-sm text-[#4d4f47] shadow-sm">
            {message}
          </p>
        ) : null}

        <AccountAvatarUploader currentAvatarUrl={currentUser.avatarUrl} displayName={currentUser.displayName} />

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="mt-1 text-sm text-[#66685f]">
              Your name and contact details for Scribbl.
            </p>
          </div>

          <form action={updateAccountProfile} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">First name</span>
                <input
                  name="firstName"
                  defaultValue={currentUser.firstName}
                  required
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Last name</span>
                <input
                  name="lastName"
                  defaultValue={currentUser.lastName}
                  required
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Display name</span>
              <input
                name="displayName"
                defaultValue={currentUser.displayName}
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Email address</span>
              <input
                name="email"
                type="email"
                defaultValue={currentUser.email}
                required
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Role</span>
              <input
                value={formatRole(currentUser.role)}
                readOnly
                className="min-h-11 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] px-3 text-sm text-[#66685f] outline-none"
              />
            </label>
            <div className="flex justify-end">
              <PendingSubmitButton
                pendingLabel="Saving..."
                className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a] disabled:cursor-not-allowed disabled:bg-[#9cac9f]"
              >
                Save Account
              </PendingSubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Password</h2>
            <p className="mt-1 text-sm text-[#66685f]">************</p>
          </div>

          <form action={updateAccountPassword} className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">New password</span>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="************"
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
              />
            </label>
            <div className="flex justify-end">
              <PendingSubmitButton
                pendingLabel="Updating..."
                className="rounded-md border border-[#c8c8bd] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Update Password
              </PendingSubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Notifications</h2>
            <p className="mt-1 text-sm text-[#66685f]">Choose what shows up in your in-app notification inbox.</p>
          </div>

          <form action={updateNotificationPreferences} className="mt-5 grid gap-3">
            <NotificationToggle
              name="announcements"
              label="Announcements"
              description="Workspace-wide posts from owners and admins."
              defaultChecked={notificationPreference?.announcements ?? notificationPreferenceDefaults.announcements}
            />
            <NotificationToggle
              name="meetings"
              label="Meeting updates"
              description="Scheduled, changed, or canceled meetings."
              defaultChecked={notificationPreference?.meetings ?? notificationPreferenceDefaults.meetings}
            />
            <NotificationToggle
              name="files"
              label="Shared files"
              description="Files added to a workspace or meeting."
              defaultChecked={notificationPreference?.files ?? notificationPreferenceDefaults.files}
            />
            <NotificationToggle
              name="notes"
              label="Shared notes"
              description="Notes and whiteboards shared with the workspace."
              defaultChecked={notificationPreference?.notes ?? notificationPreferenceDefaults.notes}
            />
            <NotificationToggle
              name="chatMessages"
              label="Chat messages"
              description="Regular channel messages. Off by default to keep noise down."
              defaultChecked={notificationPreference?.chatMessages ?? notificationPreferenceDefaults.chatMessages}
            />
            <div className="flex justify-end pt-2">
              <PendingSubmitButton
                pendingLabel="Saving..."
                className="rounded-md border border-[#c8c8bd] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save Preferences
              </PendingSubmitButton>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-[#d8b8b2] bg-white p-5 shadow-sm">
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[#7a2f24]">Delete Account</h2>
              <p className="mt-1 text-sm text-[#66685f]">
                This signs you out, deletes your login, removes you from memberships, and anonymizes your shared history.
              </p>
            </div>
            {ownedWorkspaces.length > 0 ? (
              <div className="rounded-md border border-[#e2c5bf] bg-[#fff7f5] p-3 text-sm text-[#7a2f24]">
                <p className="font-medium">Account deletion is blocked while you own workspaces.</p>
                <div className="mt-2 grid gap-1 text-[#6d413b]">
                  {ownedWorkspaces.map((membership) => (
                    <Link
                      key={membership.id}
                      href={`/workspaces/${membership.workspace.id}/members`}
                      className="font-medium underline underline-offset-2"
                    >
                      {membership.workspace.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            <form action={deleteAccount} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Type DELETE to confirm</span>
                <input
                  name="confirmation"
                  required
                  pattern="DELETE"
                  disabled={!canDeleteAccount}
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#8a3328] disabled:bg-[#f1f1ec] disabled:text-[#777970]"
                />
              </label>
              <PendingSubmitButton
                disabled={!canDeleteAccount}
                pendingLabel="Deleting..."
                className="min-h-11 rounded-md bg-[#8a3328] px-4 text-sm font-medium text-white transition hover:bg-[#70291f] disabled:cursor-not-allowed disabled:bg-[#c8c8bd]"
              >
                Delete Account
              </PendingSubmitButton>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function formatRole(role: string) {
  return role.toLowerCase().replaceAll("_", " ");
}

function NotificationToggle({
  defaultChecked,
  description,
  label,
  name,
}: {
  defaultChecked: boolean;
  description: string;
  label: string;
  name: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-[#e6e6dc] bg-[#fbfbf8] px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#4d4f47]">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#777970]">{description}</span>
      </span>
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="size-4 accent-[#2f604b]"
      />
    </label>
  );
}
