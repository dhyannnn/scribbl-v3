import Link from "next/link";

export function ProtectedPageMessage({
  title = "Sign in to continue",
  message = "Use your Scribbl account to open this workspace.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <main className="min-h-screen bg-[var(--color-surface-low)] px-5 py-16">
      <section className="mx-auto max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">Protected workspace</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{message}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-full bg-[var(--color-secondary)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Go to login
        </Link>
      </section>
    </main>
  );
}
