import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Documentation — Scribbl",
};

type Section = {
  title: string;
  items: { q: string; a: string }[];
};

const sections: Section[] = [
  {
    title: "Getting Started",
    items: [
      {
        q: "What is Scribbl?",
        a: "Scribbl is a collaborative workspace for teams, classes, and projects. It brings notes, whiteboards, meetings, files, and real-time chat into one place so your work stays connected.",
      },
      {
        q: "How do I create a workspace?",
        a: "From the Dashboard, click \"New Workspace\". Choose a workspace type (Team, Project, or Class), enter a name, and you're in. Free accounts can own one workspace; paid plans unlock unlimited workspaces.",
      },
      {
        q: "How do I invite teammates?",
        a: "Open your workspace and go to Members. Click \"Invite Member\" and enter their email address. They'll receive an email invitation to join.",
      },
    ],
  },
  {
    title: "Notes & Text Editor",
    items: [
      {
        q: "How do I create a note?",
        a: "Inside a workspace, go to Notes and click \"New Note\" (for a text note) or \"New Whiteboard\" (for a canvas). You can also create a private note visible only to you.",
      },
      {
        q: "How do I use the slash command menu?",
        a: "In the text editor, type / at the start of any line to open the command menu. Use the arrow keys to navigate and press Enter (or click) to insert: headings, lists, code blocks, math, tables, dividers, and quotes.",
      },
      {
        q: "How does real-time collaboration work?",
        a: "Notes and whiteboards use Liveblocks + Yjs for conflict-free real-time sync. When collaborators are active, their avatars appear in the top bar. Changes merge automatically — there is no \"last write wins\".",
      },
      {
        q: "How do I insert math / LaTeX?",
        a: "Type $...$ for inline math or $$...$$ for display math, then press Escape or Enter to render it. You can also use the slash menu and choose Math, or press ⌘ Alt M.",
      },
      {
        q: "How do I export a note as PDF?",
        a: "Click \"Export PDF\" in the top bar of the note editor. This feature requires a Pro or Institution plan.",
      },
      {
        q: "What are note visibility settings?",
        a: "Each note can be Workspace Shared (visible to all members) or Private (only you). Use the visibility dropdown in the top bar to change it. Only note owners and workspace admins can change visibility on shared notes.",
      },
    ],
  },
  {
    title: "Whiteboards",
    items: [
      {
        q: "Who can edit a shared whiteboard?",
        a: "Shared whiteboards require a Pro or Institution plan. On the Free plan, shared whiteboards are view-only for all members; private whiteboards are always editable by the owner.",
      },
      {
        q: "Can I upload images to a whiteboard?",
        a: "Image uploads on whiteboards require a Pro or Institution plan. The image upload button is hidden on the Free plan.",
      },
    ],
  },
  {
    title: "Meetings",
    items: [
      {
        q: "How do I schedule a meeting?",
        a: "Go to Meetings inside a workspace and click \"New Meeting\". Fill in the title, date, time, and optional recurrence. Invited members get an email notification.",
      },
      {
        q: "How do recurring meetings work?",
        a: "When scheduling, set recurrence to Daily, Weekly, Biweekly, or Monthly. Each occurrence is its own meeting page with shared notes, whiteboards, and files. When editing or cancelling you can choose to affect just this meeting, this and all future, or all occurrences.",
      },
      {
        q: "How do I record a meeting?",
        a: "Recording is available on Pro and Institution plans. Inside the video room, click the Record button in the controls bar. The recording is saved as an MP4 and appears in your workspace Files after the meeting ends.",
      },
      {
        q: "What is the floating video panel?",
        a: "When you navigate away from the video room during a meeting, a small floating panel keeps the video feed visible in the corner. Click it to return to the full video room.",
      },
    ],
  },
  {
    title: "Files & Storage",
    items: [
      {
        q: "Where can I see my storage usage?",
        a: "Storage is shown in the AppSidebar (left sidebar) per workspace. The Files page and Billing page both show detailed shared and private storage meters.",
      },
      {
        q: "What counts toward shared storage vs private storage?",
        a: "Files uploaded as Workspace Shared (visible to all members) count toward shared storage. Files uploaded as Private count toward your personal storage quota. Each plan has separate limits for both.",
      },
      {
        q: "Can I pin files?",
        a: "Yes. Workspace Owners and Admins can pin up to 10 files per workspace. Pinned files appear at the top of the Files page and in the Chat right panel for quick access.",
      },
    ],
  },
  {
    title: "Billing & Plans",
    items: [
      {
        q: "What are the available plans?",
        a: "Free ($0) — 1 owned workspace, 3 members, 500 MB shared / 200 MB private storage, no recordings. Pro ($25 CAD/mo) — 20 members, 10 GB shared / 2 GB private, 5 hours of recordings/month. Institution ($65 CAD/mo) — 50 members, 50 GB shared / 5 GB private, 20 hours of recordings/month, audit log.",
      },
      {
        q: "How does overage billing work?",
        a: "On Pro and Institution plans, if your workspace exceeds the included member count or recording hours, overage charges are added to your next invoice automatically. Member overage: $1/member/month (Pro) or $0.50 (Institution). Recording overage: $1.50/hour.",
      },
      {
        q: "How do I upgrade or manage my subscription?",
        a: "Go to your workspace's Billing page (only visible to the workspace Owner). Click \"Upgrade\" to start a Stripe checkout, or \"Manage Subscription\" to access the Stripe Customer Portal for invoices, payment methods, and cancellation.",
      },
      {
        q: "Is there an Enterprise plan?",
        a: "Yes. Enterprise starts at $250 CAD/month and is billed annually. Contact us at billing@scribblapp.ca to discuss custom pricing, SLAs, and dedicated support.",
      },
    ],
  },
  {
    title: "Keyboard Shortcuts",
    items: [
      {
        q: "What are the main keyboard shortcuts?",
        a: [
          "⌘K — Open command palette (anywhere)",
          "/ — Slash command menu in the text editor",
          "⌘B — Bold · ⌘I — Italic · ⌘U — Underline",
          "⌘Alt+M — Insert inline math · ⌘Alt+C — Code block",
          "⌘Alt+1–6 — Headings · ⌘Shift+7 — Numbered list · ⌘Shift+8 — Bullet list",
          "⌘Shift+9 — Blockquote · ⌘⇧K (in editor) — Insert/edit link",
        ].join("\n"),
      },
    ],
  },
  {
    title: "Account & Settings",
    items: [
      {
        q: "How do I change my display name or avatar?",
        a: "Go to Settings (gear icon in the left sidebar). You can update your display name, upload a profile photo, and manage notification preferences.",
      },
      {
        q: "How do I delete my account?",
        a: "In Settings, scroll to the bottom and click \"Delete Account\". This is permanent and removes all your private data. Workspace-shared content may remain for other members.",
      },
      {
        q: "How do I delete a workspace?",
        a: "Go to your workspace's Settings (collapsible section on the Workspace Home page, visible to Owners). Type the workspace name to confirm, then click Delete. This cancels the Stripe subscription and removes all shared files.",
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[800px] px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="font-display text-3xl font-bold text-[var(--color-text)]">Help & Documentation</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          Everything you need to know about Scribbl. Can&apos;t find an answer?{" "}
          <a href="mailto:inquiry@scribblapp.ca" className="text-[var(--color-secondary)] hover:underline">
            Email us
          </a>
          .
        </p>
      </div>

      {/* Quick links */}
      <div className="mb-10 flex flex-wrap gap-2">
        {sections.map((s) => (
          <a
            key={s.title}
            href={`#${slugify(s.title)}`}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          >
            {s.title}
          </a>
        ))}
      </div>

      {/* Sections */}
      <div className="space-y-10">
        {sections.map((section) => (
          <section key={section.title} id={slugify(section.title)}>
            <h2 className="mb-4 font-display text-lg font-bold text-[var(--color-text)]">
              {section.title}
            </h2>
            <div className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
              {section.items.map((item) => (
                <details key={item.q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[var(--color-text)] select-none">
                    {item.q}
                    <span className="shrink-0 text-[var(--color-muted)] transition group-open:rotate-180">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--color-muted)]">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="mt-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-low)] p-6 text-center">
        <p className="font-semibold text-[var(--color-text)]">Still need help?</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Reach out and we&apos;ll get back to you within one business day.
        </p>
        <a
          href="mailto:inquiry@scribblapp.ca"
          className="mt-4 inline-block rounded-full bg-[var(--color-secondary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-secondary-hover)]"
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
