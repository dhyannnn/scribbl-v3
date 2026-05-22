import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  FileText,
  GitBranch,
  Layers,
  MessageSquare,
  Mic,
  PenLine,
  Shield,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import { LandingFeedbackForm } from "@/components/LandingFeedbackForm";

const whiteboardScreenshot = "/Screenshot 2026-05-17 at 1.11.45 PM.png";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
      <LandingNav />
      <Hero />
      <BeforeAfter />
      <ScreenshotFeatures />
      <HowItWorks />
      <GenericComparison />
      <AboutSection />
      <OriginStory />
      <LandingPricing />
      <FeedbackSection />
      <ComingSoon />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}

function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center">
          <Image
            src="/scribbl-logo.png"
            alt="Scribbl"
            width={120}
            height={48}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            How it works
          </a>
          <a href="#about" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            About
          </a>
          <a href="#pricing" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Pricing
          </a>
          <a href="#feedback" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Feedback
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface-mid)] hover:text-[var(--color-text)] sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-80"
          >
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate min-h-[calc(100vh-65px)] overflow-hidden bg-[var(--color-live)]">
      <Image
        src="/screen.png"
        alt="Collaborative Scribbl notes editor"
        fill
        priority
        sizes="100vw"
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(19,27,46,0.95)_0%,rgba(19,27,46,0.78)_48%,rgba(19,27,46,0.48)_100%)]" />

      <div className="mx-auto grid min-h-[calc(100vh-65px)] max-w-7xl items-center gap-12 px-5 pb-24 pt-20 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-10">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white">
            <Sparkles size={14} />
            Live sessions, notes, chat, files, and whiteboards in one place
          </span>

          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] text-white sm:text-6xl lg:text-7xl">
            One workspace for every working session.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/82 sm:text-xl">
            Scribbl keeps the conversation, canvas, notes, recordings, and shared files
            together so teams can stay in flow from planning to recap.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-[var(--color-live)] shadow-lg transition hover:bg-[var(--color-secondary-dim)]"
            >
              Start free <ArrowRight size={17} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/30 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white/10"
            >
              View pricing
            </Link>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-2 gap-3 text-sm font-semibold text-white/86 sm:grid-cols-3">
            {["Video", "Notes", "Whiteboard", "Chat", "Files", "Recordings"].map((label) => (
              <div key={label} className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center backdrop-blur">
                {label}
              </div>
            ))}
          </div>
        </div>

        <SessionHubMockup />
      </div>
    </section>
  );
}

function SessionHubMockup() {
  return (
    <div className="hidden lg:block">
      <div className="relative rounded-2xl border border-white/15 bg-white/12 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-white/60">Live workspace</p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">Q2 product review</h2>
          </div>
          <span className="rounded-full bg-[var(--color-success-dim)] px-3 py-1 text-xs font-bold text-[var(--color-success)]">
            Recording
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {["AK", "MT", "JR", "SL"].map((initials, index) => (
                <div key={initials} className={`flex aspect-video items-end rounded-2xl border border-white/10 p-3 ${index === 0 ? "bg-[#d8e2ff]" : "bg-white/14"}`}>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${index === 0 ? "bg-[var(--color-live)] text-white" : "bg-white/15 text-white"}`}>
                    {initials}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white p-4 text-[var(--color-text)]">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">Shared notes</p>
                <span className="rounded-full bg-[var(--color-success-dim)] px-2.5 py-1 text-xs font-bold text-[var(--color-success)]">Saved</span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-11/12 rounded-full bg-[var(--color-surface-high)]" />
                <div className="h-3 w-4/5 rounded-full bg-[var(--color-surface-high)]" />
                <div className="h-3 w-3/5 rounded-full bg-[var(--color-secondary-dim)]" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/95 p-4 text-[var(--color-text)]">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">Whiteboard</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="h-16 rounded-xl bg-[var(--color-secondary-dim)]" />
                <div className="h-16 rounded-xl bg-[var(--color-warning-dim)]" />
                <div className="col-span-2 h-12 rounded-xl bg-[var(--color-surface-mid)]" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/12 p-4 text-white">
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-white/60">Channel chat</p>
              <div className="mt-4 space-y-3 text-sm">
                <p className="rounded-2xl rounded-tl-sm bg-white/18 px-3 py-2">Decision logged in notes.</p>
                <p className="ml-8 rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-[var(--color-live)]">Uploading the deck now.</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[var(--color-live)]">
              4 artifacts attached to this session
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BeforeAfter() {
  return (
    <section className="bg-[var(--color-surface)] py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            The workflow shift
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            Stop reconstructing the meeting after it ends.
          </h2>
          <p className="mt-5 text-lg leading-8 text-[var(--color-muted)]">
            Scribbl keeps the moving parts of real collaboration attached to the same workspace,
            so context does not disappear into separate tools, folders, and threads.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <WorkflowPanel
            eyebrow="Before"
            title="Everything lives somewhere else"
            tone="muted"
            items={[
              "Video link in one tab",
              "Notes in a separate document",
              "Whiteboard exported later",
              "Files buried in a drive",
              "Decisions lost in chat",
            ]}
          />
          <WorkflowPanel
            eyebrow="After"
            title="One session, one source of truth"
            tone="active"
            items={[
              "Meeting hub opens with the workspace",
              "Notes, canvas, chat, and files stay linked",
              "Recordings save back to the right place",
              "Teams can review the full session trail",
              "Admins keep roles, billing, and access organized",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function WorkflowPanel({
  eyebrow,
  items,
  title,
  tone,
}: {
  eyebrow: string;
  items: string[];
  title: string;
  tone: "active" | "muted";
}) {
  return (
    <div className={`rounded-2xl border p-7 ${tone === "active" ? "border-[var(--color-secondary)] bg-[var(--color-surface-low)]" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">{eyebrow}</p>
      <h3 className="mt-3 font-display text-2xl font-bold text-[var(--color-text)]">{title}</h3>
      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone === "active" ? "bg-[var(--color-secondary)] text-white" : "bg-[var(--color-surface-mid)] text-[var(--color-subtle)]"}`}>
              {tone === "active" ? <Check size={15} /> : <X size={15} />}
            </span>
            <span className="text-sm font-semibold text-[var(--color-muted)]">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenshotFeatures() {
  return (
    <section id="features" className="-mt-14 bg-[var(--color-bg)] pb-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <FeatureShowcase
            eyebrow="Collaborative notes"
            title="Turn every session into a living document."
            body="Write together in real time with rich formatting, math, tables, code, comments, and PDF export close at hand."
            image="/screen.png"
            icon={<FileText size={20} />}
            priority
          />
          <FeatureShowcase
            eyebrow="Shared whiteboards"
            title="Sketch the messy parts together."
            body="Use a real multiplayer canvas for diagrams, examples, brainstorms, templates, and visual explanations."
            image={whiteboardScreenshot}
            icon={<PenLine size={20} />}
          />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Video size={19} />, title: "Live video", body: "Session rooms stay attached to the workspace." },
            { icon: <MessageSquare size={19} />, title: "Workspace chat", body: "Channels, meeting chats, and announcements." },
            { icon: <Layers size={19} />, title: "Shared files", body: "Decks, PDFs, exports, and recordings in one library." },
            { icon: <Shield size={19} />, title: "Admin controls", body: "Roles, groups, billing, moderation, and audit logs." },
          ].map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                {icon}
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-[var(--color-text)]">{title}</h3>
              <p className="mt-2 leading-7 text-[var(--color-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureShowcase({
  body,
  eyebrow,
  icon,
  image,
  priority = false,
  title,
}: {
  body: string;
  eyebrow: string;
  icon: ReactNode;
  image: string;
  priority?: boolean;
  title: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/5">
      <div className="relative aspect-[16/10] bg-[var(--color-surface-low)]">
        <Image
          src={image}
          alt={title}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-live)] text-white">
            {icon}
          </span>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            {eyebrow}
          </p>
        </div>
        <h2 className="mt-5 font-display text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 leading-8 text-[var(--color-muted)]">{body}</p>
      </div>
    </article>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <CalendarDays size={21} />,
      title: "Schedule or open a workspace",
      body: "Create a team, project, client, or department workspace, then schedule live sessions with the right people.",
    },
    {
      icon: <Video size={21} />,
      title: "Meet where the work lives",
      body: "Join video, open the whiteboard, take notes, chat, upload files, and record without scattering context.",
    },
    {
      icon: <Mic size={21} />,
      title: "Keep the recap attached",
      body: "Notes, files, recordings, meeting chats, and artifacts stay connected to the session and workspace.",
    },
  ];

  return (
    <section id="how-it-works" className="border-y border-[var(--color-border)] bg-[var(--color-surface)] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            How it works
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            Less app switching. More shared context.
          </h2>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map(({ icon, title, body }, index) => (
            <div key={title} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-7">
              <div className="flex items-center justify-between gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white">
                  {icon}
                </span>
                <span className="font-mono text-xs font-bold text-[var(--color-subtle)]">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-6 font-display text-xl font-bold">{title}</h3>
              <p className="mt-3 leading-7 text-[var(--color-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GenericComparison() {
  const rows = [
    { feature: "Live video sessions", scribbl: true, videoOnly: true, whiteboardOnly: false },
    { feature: "Collaborative whiteboards", scribbl: true, videoOnly: "Limited", whiteboardOnly: true },
    { feature: "Rich shared notes", scribbl: true, videoOnly: false, whiteboardOnly: "Limited" },
    { feature: "Workspace chat", scribbl: true, videoOnly: false, whiteboardOnly: false },
    { feature: "Files, exports, and recordings", scribbl: true, videoOnly: "Scattered", whiteboardOnly: "Scattered" },
    { feature: "Meeting artifacts linked together", scribbl: true, videoOnly: false, whiteboardOnly: false },
    { feature: "Groups, roles, and billing controls", scribbl: true, videoOnly: "Limited", whiteboardOnly: "Limited" },
  ];

  return (
    <section className="bg-[var(--color-bg)] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            Compare the workflow
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            One connected workspace instead of a tool pile.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[var(--color-muted)]">
            Scribbl brings the pieces of a live working session into one place without naming,
            borrowing from, or relying on other products.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-low)]">
                <th className="px-6 py-4 text-left font-bold text-[var(--color-text)]">Capability</th>
                <th className="px-6 py-4 text-center font-bold text-[var(--color-secondary)]">Scribbl</th>
                <th className="px-6 py-4 text-center font-semibold text-[var(--color-muted)]">Video-only tools</th>
                <th className="px-6 py-4 text-center font-semibold text-[var(--color-muted)]">Whiteboard-only tools</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, scribbl, videoOnly, whiteboardOnly }, i) => (
                <tr key={feature} className={i < rows.length - 1 ? "border-b border-[var(--color-border)]" : ""}>
                  <td className="px-6 py-4 font-semibold text-[var(--color-muted)]">{feature}</td>
                  <td className="px-6 py-4 text-center"><ComparisonCell value={scribbl} primary /></td>
                  <td className="px-6 py-4 text-center"><ComparisonCell value={videoOnly} /></td>
                  <td className="px-6 py-4 text-center"><ComparisonCell value={whiteboardOnly} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ComparisonCell({ value, primary = false }: { value: boolean | string; primary?: boolean }) {
  if (value === true) {
    return (
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${primary ? "bg-[var(--color-secondary)] text-white" : "bg-[var(--color-success-dim)] text-[var(--color-success)]"}`}>
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }

  if (value === false) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-mid)] text-[var(--color-subtle)]">
        <X size={14} strokeWidth={3} />
      </span>
    );
  }

  return <span className="rounded-full bg-[var(--color-warning-dim)] px-3 py-1 text-xs font-bold text-[var(--color-warning)]">{value}</span>;
}

function AboutSection() {
  return (
    <section id="about" className="border-y border-[var(--color-border)] bg-[var(--color-surface)] py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            About Scribbl
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            Built for groups that need the whole conversation.
          </h2>
        </div>
        <div className="space-y-5 text-lg leading-8 text-[var(--color-muted)]">
          <p>
            Scribbl started from a simple frustration: live collaboration usually creates
            a trail of scattered links, missing files, half-finished notes, and follow-up
            messages that no one can find later.
          </p>
          <p>
            We are building one workspace where teams can meet, draw, write, chat, share,
            record, and return to the full context of the work. It is made for project teams,
            operators, product groups, labs, classes, and any group that needs a shared room
            for thinking out loud.
          </p>

          <div className="grid gap-4 pt-4 sm:grid-cols-3">
            {[
              { icon: <Users size={19} />, label: "Built for teams" },
              { icon: <GitBranch size={19} />, label: "Context stays linked" },
              { icon: <Building2 size={19} />, label: "Ready for organizations" },
            ].map(({ icon, label }) => (
              <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                  {icon}
                </div>
                <p className="mt-4 text-sm font-bold text-[var(--color-text)]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OriginStory() {
  return (
    <section className="bg-[var(--color-bg)] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
              Our story
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              Built from real frustration, shaped by real feedback.
            </h2>
            <p className="mt-6 leading-8 text-[var(--color-muted)]">
              Scribbl started at a hackathon — a weekend sprint to solve the chaos of collaborative study sessions. Too many tabs, too many tools, too much friction just to sit down and work together.
            </p>
            <p className="mt-4 leading-8 text-[var(--color-muted)]">
              That prototype became the foundation for two back-to-back course projects: a UX/UI final where we stress-tested every screen against real users, and a database systems final where we designed the architecture that powers it today.
            </p>
            <p className="mt-4 leading-8 text-[var(--color-muted)]">
              Along the way we sat down with students pulling late-night study sessions, tutors managing dozens of learners at once, and corporate teams running weekly syncs across time zones. We asked them what they hated about their current tools, what they wished existed, and what they would actually pay for.
            </p>
            <p className="mt-4 leading-8 text-[var(--color-muted)]">
              Every feature in Scribbl — the meeting hub, shared whiteboards, collaborative notes, real-time chat — came directly from those conversations. No guesswork. No features built to impress a demo. Just the things people told us they actually needed.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {[
              { label: "Started at a hackathon", body: "A weekend to build something that solved a real problem. We didn't sleep much, but we shipped." },
              { label: "Refined through coursework", body: "A UX/UI final project taught us how to design for people. A database systems project taught us how to make it scale." },
              { label: "Validated by real users", body: "Interviews with students, tutors, and corporate teams across multiple organizations shaped every product decision." },
              { label: "Built on actual feedback", body: "Not hypothetical users. Real people who told us exactly what they needed and what they'd throw away." },
            ].map(({ label, body }) => (
              <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
                <p className="font-display text-base font-bold text-[var(--color-text)]">{label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingPricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      per: "",
      description: "For small groups getting started.",
      cta: "Start free",
      href: "/login",
      highlight: false,
      features: ["1 workspace · 3 members max", "Video calls and chat", "Text notes", "Private whiteboards (solo)", "500 MB shared / 200 MB private storage"],
    },
    {
      name: "Pro",
      price: "$25",
      per: "CAD / workspace / month",
      description: "For teams that run sessions every week.",
      cta: "Start Pro",
      href: "/login",
      highlight: true,
      features: ["Unlimited workspaces", "20 members included (+$1/mo extra)", "Shared + collaborative whiteboards", "Whiteboard PDF export & image uploads", "Recordings — 5 hrs/mo", "10 GB shared · 2 GB private storage"],
    },
    {
      name: "Institution",
      price: "$65",
      per: "CAD / workspace / month",
      description: "For larger teams with compliance needs.",
      cta: "Get started",
      href: "/login",
      highlight: false,
      features: ["50 members included (+$0.50/mo extra)", "20 hrs/mo recordings", "50 GB shared · 5 GB private storage", "Audit log · Priority support"],
    },
  ];

  return (
    <section id="pricing" className="bg-[var(--color-surface)] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            Pricing
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl lg:text-5xl">
            Simple pricing for real collaboration.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[var(--color-muted)]">
            Per workspace, not per seat. Start free and upgrade when your team grows.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {tiers.map(({ name, price, per, description, cta, href, highlight, features }) => (
            <div
              key={name}
              className={`relative flex flex-col rounded-2xl border bg-[var(--color-surface)] p-8 ${
                highlight
                  ? "border-[var(--color-secondary)] shadow-xl shadow-blue-950/10"
                  : "border-[var(--color-border)] shadow-sm"
              }`}
            >
              {highlight ? (
                <span className="absolute right-5 top-5 rounded-full bg-[var(--color-secondary-dim)] px-3 py-1 text-xs font-bold text-[var(--color-secondary)]">
                  Most popular
                </span>
              ) : null}
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-subtle)]">{name}</p>
              <div className="mt-4 flex items-end gap-2">
                <span className="font-display text-4xl font-bold text-[var(--color-text)]">{price}</span>
                {per ? <span className="mb-1 max-w-[140px] text-xs font-semibold text-[var(--color-muted)]">{per}</span> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{description}</p>

              <Link
                href={href}
                className={`mt-7 block rounded-full px-5 py-3 text-center text-sm font-bold transition ${
                  highlight
                    ? "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)]"
                    : "border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                }`}
              >
                {cta}
              </Link>

              <ul className="mt-7 grid gap-3 text-sm font-medium text-[var(--color-muted)]">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-[var(--color-secondary)]" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-[var(--color-muted)]">
          Taxes calculated at checkout. Prices in Canadian dollars.
          Need custom limits or an annual contract?{" "}
          <a href="mailto:billing@scribblapp.ca?subject=Enterprise inquiry" className="font-bold text-[var(--color-secondary)] hover:underline">
            Contact us about Enterprise →
          </a>
          <br className="hidden sm:block" />
          <Link href="/pricing" className="mt-1 inline-block font-medium text-[var(--color-secondary)] hover:underline">
            Full plan comparison →
          </Link>
        </p>
      </div>
    </section>
  );
}

function FeedbackSection() {
  return (
    <section id="feedback" className="bg-[var(--color-bg)] py-24">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            Feedback
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
            Shape what comes next.
          </h2>
          <p className="mt-5 text-lg leading-8 text-[var(--color-muted)]">
            Tell us what would make Scribbl more useful for your company, lab, startup,
            department, project team, or community.
          </p>
        </div>
        <LandingFeedbackForm />
      </div>
    </section>
  );
}

function ComingSoon() {
  const items = [
    "AI meeting summaries",
    "AI note assistant",
    "Version history",
    "Wiki-style note linking",
    "Workspace analytics",
    "Mobile app",
    "Message threading",
    "@mentions",
    "Direct messages",
    "Meeting templates",
  ];

  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--color-secondary)]">
              Coming in the next release
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
              The roadmap is already moving.
            </h2>
          </div>
          <a
            href="#feedback"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-bold text-[var(--color-text)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
          >
            Tell us what to prioritize <ArrowRight size={15} />
          </a>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm font-bold text-[var(--color-muted)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="bg-[var(--color-live)] py-24 text-white">
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <h2 className="font-display text-3xl font-bold sm:text-4xl lg:text-5xl">
          Ready to run your next session in one place?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-white/75">
          Create your first workspace in seconds. No credit card required.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-bold text-[var(--color-live)] transition hover:bg-[var(--color-secondary-dim)]"
          >
            Start free <ArrowRight size={16} />
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-white/30 px-8 py-3.5 text-base font-bold text-white transition hover:bg-white/10"
          >
            View pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center">
          <Image
            src="/scribbl-logo.png"
            alt="Scribbl"
            width={96}
            height={38}
            className="h-8 w-auto object-contain"
          />
        </Link>

        <p className="text-sm text-[var(--color-muted)]">
          © {new Date().getFullYear()} Scribbl. All rights reserved.
        </p>

        <nav className="flex flex-wrap items-center gap-6">
          <Link href="/login" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Sign in
          </Link>
          <a href="#feedback" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Feedback
          </a>
          <Link href="/contact" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Contact
          </Link>
          <Link href="/privacy" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Privacy
          </Link>
          <Link href="/terms" className="text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
