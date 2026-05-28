import Link from "next/link";

export const metadata = { title: "Contact — Scribbl" };

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
        <Link href="/" className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
          ← Back to Scribbl
        </Link>

        <h1 className="mt-6 font-display text-4xl font-bold">Contact us</h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted)]">
          We&apos;re a small team and we read every message. Whether you have a question, a bug report, a feature idea, or just want to say hi — reach out.
        </p>

        <div className="mt-10 grid gap-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">General enquiries</p>
            <p className="mt-2 text-[var(--color-muted)]">Questions about Scribbl, your account, or anything else.</p>
            <a
              href="mailto:inquiry@scribblapp.ca"
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--color-secondary)] hover:underline"
            >
              inquiry@scribblapp.ca
            </a>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">Billing &amp; subscriptions</p>
            <p className="mt-2 text-[var(--color-muted)]">
              Problems with a charge, upgrading, or cancelling? Most billing issues can be resolved directly from{" "}
              <strong>Workspace → Settings → Billing</strong>. If you&apos;re still stuck, email us.
            </p>
            <a
              href="mailto:billing@scribblapp.ca?subject=Billing inquiry"
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--color-secondary)] hover:underline"
            >
              billing@scribblapp.ca
            </a>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">Enterprise &amp; institutions</p>
            <p className="mt-2 text-[var(--color-muted)]">
              Looking for custom pricing, a service agreement, or dedicated support for your organization?
            </p>
            <a
              href="mailto:billing@scribblapp.ca?subject=Enterprise inquiry"
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--color-secondary)] hover:underline"
            >
              billing@scribblapp.ca
            </a>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">Bug reports &amp; feedback</p>
            <p className="mt-2 text-[var(--color-muted)]">
              Found something broken? Have an idea you think we&apos;d love? Drop us a note — we genuinely use every piece of feedback.
            </p>
            <a
              href="mailto:feedback@scribblapp.ca?subject=Bug report"
              className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[var(--color-secondary)] hover:underline"
            >
              feedback@scribblapp.ca
            </a>
          </div>
        </div>

        <p className="mt-10 text-sm text-[var(--color-subtle)]">
          We aim to respond within one business day.
        </p>
      </div>
    </main>
  );
}
