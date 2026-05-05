import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
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

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8">
        <header className="border-b border-[#d8d8ce] pb-6">
          <Link href="/" className="text-sm font-medium text-[#2f604b]">
            Back to dashboard
          </Link>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-[#171713]">Account</h1>
        </header>

        {message ? (
          <p className="rounded-md border border-[#d8d8ce] bg-white p-3 text-sm text-[#4d4f47] shadow-sm">
            {message}
          </p>
        ) : null}

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
              <button className="rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]">
                Save Account
              </button>
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
              <button className="rounded-md border border-[#c8c8bd] bg-white px-4 py-2 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                Update Password
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-md border border-[#d8b8b2] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#7a2f24]">Delete Account</h2>
              <p className="mt-1 text-sm text-[#66685f]">
                This signs you out and removes your account from Scribbl.
              </p>
            </div>
            <form action={deleteAccount}>
              <button className="rounded-md bg-[#8a3328] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#70291f]">
                Delete Account
              </button>
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
