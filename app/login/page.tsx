import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseAuthUser } from "@/lib/current-user";
import { signInWithOAuth, signInWithPassword, signUpWithPassword } from "../auth/actions";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string;
    mode?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [{ message, mode, next }, authUser] = await Promise.all([searchParams, getSupabaseAuthUser()]);
  const safeNext = getSafeNext(next);

  if (authUser) {
    redirect(safeNext);
  }

  const isSignup = mode === "signup";
  const modeHref = isSignup
    ? createLoginHref({ next: safeNext })
    : createLoginHref({ mode: "signup", next: safeNext });

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
        <Link href="/" className="text-sm font-medium text-[#2f604b]">
          Scribbl
        </Link>
        <section className="mt-5 rounded-md border border-[#d8d8ce] bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold">{isSignup ? "Create your account" : "Sign in"}</h1>
          <p className="mt-3 text-sm leading-6 text-[#66685f]">
            Use your Scribbl account to open workspaces, notes, meetings, and files.
          </p>

          {message ? (
            <p className="mt-5 rounded-md border border-[#d8d8ce] bg-[#fbfbf8] p-3 text-sm text-[#4d4f47]">
              {message}
            </p>
          ) : null}

          <form action={isSignup ? signUpWithPassword : signInWithPassword} className="mt-5 grid gap-3">
            {safeNext !== "/" ? <input type="hidden" name="next" value={safeNext} /> : null}
            {isSignup ? (
              <label className="grid gap-2">
                <span className="text-sm font-medium text-[#4d4f47]">Name</span>
                <input
                  name="displayName"
                  className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
                />
              </label>
            ) : null}
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Email</span>
              <input
                name="email"
                type="email"
                required
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#4d4f47]">Password</span>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                className="min-h-11 rounded-md border border-[#c8c8bd] bg-white px-3 text-sm outline-none transition focus:border-[#2f604b]"
              />
            </label>
            <button className="mt-2 rounded-md bg-[#2f604b] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#244b3a]">
              {isSignup ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="my-5 h-px bg-[#e2e2d8]" />

          <div className="grid gap-2">
            <form action={signInWithOAuth}>
              <input type="hidden" name="provider" value="google" />
              {safeNext !== "/" ? <input type="hidden" name="next" value={safeNext} /> : null}
              <button className="w-full rounded-md border border-[#c8c8bd] bg-white px-4 py-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                Continue with Google
              </button>
            </form>
            <form action={signInWithOAuth}>
              <input type="hidden" name="provider" value="azure" />
              {safeNext !== "/" ? <input type="hidden" name="next" value={safeNext} /> : null}
              <button className="w-full rounded-md border border-[#c8c8bd] bg-white px-4 py-3 text-sm font-medium text-[#2f604b] transition hover:bg-[#eef5ef]">
                Continue with Microsoft
              </button>
            </form>
          </div>

          <p className="mt-5 text-sm text-[#66685f]">
            {isSignup ? "Already have an account?" : "Need an account?"}{" "}
            <Link href={modeHref} className="font-medium text-[#2f604b]">
              {isSignup ? "Sign in" : "Create one"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

function getSafeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function createLoginHref({ mode, next }: { mode?: "signup"; next: string }) {
  const params = new URLSearchParams();

  if (mode) {
    params.set("mode", mode);
  }

  if (next !== "/") {
    params.set("next", next);
  }

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
