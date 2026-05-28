import Link from "next/link";
import { redirect } from "next/navigation";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center">
        <div className="rounded-full bg-white px-4 py-2 shadow-sm">
        {/* <div> */}
          <img src="/scribbl-logo.png" alt="Scribbl" className="h-11 w-auto object-contain" />
        </div>
      </Link>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">
          {isSignup ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {isSignup
            ? "Start collaborating with your team."
            : "Open your workspaces, notes, meetings, and files."}
        </p>

        {message ? (
          <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 text-sm text-[var(--color-muted)]">
            {message}
          </p>
        ) : null}

        {/* Email / password form */}
        <form action={isSignup ? signUpWithPassword : signInWithPassword} className="mt-6 flex flex-col gap-4">
          {safeNext !== "/" ? <input type="hidden" name="next" value={safeNext} /> : null}

          {isSignup ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-muted)]">First name</span>
                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-muted)]">Last name</span>
                <input
                  name="lastName"
                  required
                  autoComplete="family-name"
                  className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[var(--color-muted)]">Display name</span>
                <input
                  name="displayName"
                  autoComplete="nickname"
                  placeholder="How others will see you"
                  className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
                />
              </label>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted)]">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-muted)]">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="min-h-11 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 text-sm outline-none transition focus:border-[var(--color-secondary)] focus:bg-[var(--color-surface)]"
            />
          </label>

          <PendingSubmitButton
            pendingLabel={isSignup ? "Creating account..." : "Signing in..."}
            className="mt-1 min-h-11 w-full rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSignup ? "Create account" : "Sign in"}
          </PendingSubmitButton>
        </form>

        {/* Divider */}
        <div className="relative my-6 flex items-center">
          <div className="flex-1 border-t border-[var(--color-border)]" />
          <span className="mx-4 font-mono text-xs uppercase tracking-widest text-[var(--color-subtle)]">or</span>
          <div className="flex-1 border-t border-[var(--color-border)]" />
        </div>

        {/* OAuth */}
        <div className="flex flex-col gap-3">
          <form action={signInWithOAuth}>
            <input type="hidden" name="provider" value="google" />
            {safeNext !== "/" ? <input type="hidden" name="next" value={safeNext} /> : null}
            <PendingSubmitButton
              pendingLabel="Continuing..."
              className="flex min-h-11 w-full items-center justify-center gap-3 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-low)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </PendingSubmitButton>
          </form>

        </div>

        {/* Toggle sign in / sign up */}
        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          {isSignup ? "Already have an account?" : "Need an account?"}{" "}
          <Link href={modeHref} className="font-semibold text-[var(--color-secondary)] hover:underline">
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>

      {/* Footer */}
      <div className="mt-8 flex gap-5">
        {[["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"], ["Contact Support", "mailto:inquiry@scribblapp.ca"]].map(
          ([label, href]) => (
            <a key={label} href={href} className="font-mono text-xs text-[var(--color-subtle)] transition hover:text-[var(--color-muted)]">
              {label}
            </a>
          ),
        )}
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
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
  if (mode) params.set("mode", mode);
  if (next !== "/") params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
