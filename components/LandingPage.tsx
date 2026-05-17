import Image from "next/image";
import Link from "next/link";
import {
  Video,
  PenLine,
  MessageSquare,
  FileText,
  Users,
  Shield,
  Lock,
  Check,
  X,
  Mic,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a] antialiased">
      <LandingNav />
      <Hero />
      <Problem />
      <Features />
      <Comparison />
      <Security />
      <LandingPricing />
      <CtaSection />
      <LandingFooter />
    </div>
  );
}

// ── Navigation ────────────────────────────────────────────────────────────────

function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#e2e8f0] bg-white/90 backdrop-blur-md">
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
          <a href="#features" className="text-sm font-medium text-[#64748b] transition hover:text-[#0f172a]">
            Features
          </a>
          <a href="#comparison" className="text-sm font-medium text-[#64748b] transition hover:text-[#0f172a]">
            vs Zoom &amp; Miro
          </a>
          <a href="#security" className="text-sm font-medium text-[#64748b] transition hover:text-[#0f172a]">
            Security
          </a>
          <a href="#pricing" className="text-sm font-medium text-[#64748b] transition hover:text-[#0f172a]">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-4 py-2 text-sm font-medium text-[#64748b] transition hover:bg-[#f1f5f9] hover:text-[#0f172a] sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          >
            Get started <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-[#6366f1] opacity-[0.06] blur-3xl" />
        <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-[#8b5cf6] opacity-[0.06] blur-3xl" />
      </div>

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-5 pb-24 pt-20 text-center sm:px-8 sm:pt-28 lg:px-10">
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e0e7ff] bg-[#f0f0fe] px-4 py-1.5 text-sm font-medium text-[#6366f1]">
          <Sparkles size={14} />
          Built for teams, classes, and projects
        </span>

        <h1 className="max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight text-[#0f172a] sm:text-6xl lg:text-7xl">
          One place for every{" "}
          <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">
            study session
          </span>
        </h1>

        <p className="mt-7 max-w-2xl text-lg leading-8 text-[#64748b] sm:text-xl">
          Scribbl brings live video, collaborative whiteboards, rich notes, and course
          chat together — so your class, team, or project group can focus
          on the work, not switching apps.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition hover:opacity-90"
          >
            Get started free <ArrowRight size={16} />
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-[#e2e8f0] px-8 py-3.5 text-base font-semibold text-[#0f172a] transition hover:border-[#6366f1] hover:text-[#6366f1]"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-14 flex flex-wrap justify-center gap-3">
          {[
            { icon: <Video size={14} />, label: "Live video" },
            { icon: <PenLine size={14} />, label: "Whiteboard" },
            { icon: <FileText size={14} />, label: "Rich notes" },
            { icon: <MessageSquare size={14} />, label: "Workspace chat" },
            { icon: <Mic size={14} />, label: "Recordings" },
            { icon: <Shield size={14} />, label: "Secure & private" },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-1.5 text-sm font-medium text-[#475569]"
            >
              <span className="text-[#6366f1]">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Problem ───────────────────────────────────────────────────────────────────

function Problem() {
  const problems = [
    {
      icon: "🗂️",
      title: "Too many apps",
      body: "Switching between Zoom, Google Docs, Discord, and drawing apps kills focus and wastes session time.",
    },
    {
      icon: "📄",
      title: "Notes get lost",
      body: "Whiteboard photos disappear. Shared documents become impossible to find after the session ends.",
    },
    {
      icon: "💬",
      title: "Chats disappear",
      body: "Important study discussions get buried in group chats mixed with social messages and noise.",
    },
  ];

  return (
    <section className="bg-[#f8f9ff] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#6366f1]">The Problem</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
            Learning tools weren&apos;t built for learning
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {problems.map(({ icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-[#e2e8f0] bg-white p-8 shadow-sm">
              <span className="text-4xl">{icon}</span>
              <h3 className="mt-5 text-lg font-bold text-[#0f172a]">{title}</h3>
              <p className="mt-3 leading-7 text-[#64748b]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    {
      icon: <Video size={22} />,
      color: "from-[#6366f1] to-[#818cf8]",
      title: "Live Video Calls",
      body: "HD video meetings that stay connected to your workspace. Floating PiP, split-screen, and standalone companion tab included.",
    },
    {
      icon: <PenLine size={22} />,
      color: "from-[#8b5cf6] to-[#a78bfa]",
      title: "Collaborative Whiteboard",
      body: "Sketch, annotate, and draw together in real time using tldraw — with multi-page support, templates, and one-click PDF export.",
    },
    {
      icon: <FileText size={22} />,
      color: "from-[#06b6d4] to-[#22d3ee]",
      title: "Rich Text Notes",
      body: "Real-time collaborative notes with math (LaTeX), tables, code blocks, highlighting, and instant PDF export.",
    },
    {
      icon: <MessageSquare size={22} />,
      color: "from-[#10b981] to-[#34d399]",
      title: "Workspace Chat",
      body: "iMessage-style channel chat organized by workspace. Typing indicators, message history, and announcement channels included.",
    },
    {
      icon: <Mic size={22} />,
      color: "from-[#f59e0b] to-[#fbbf24]",
      title: "Session Recordings",
      body: "Record any video session and have the MP4 automatically saved to your workspace files. Never lose a session again.",
    },
    {
      icon: <BookOpen size={22} />,
      color: "from-[#ef4444] to-[#f87171]",
      title: "File Sharing",
      body: "Upload slides, PDFs, and exported notes. Access everything from the workspace files tab, organized by session.",
    },
  ];

  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#6366f1]">Features</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
            Everything you need to learn together
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#64748b]">
            Six powerful tools, one workspace. No tabs. No context switching.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon, color, title, body }) => (
            <div key={title} className="rounded-2xl border border-[#e2e8f0] bg-white p-7 shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-sm`}>
                {icon}
              </div>
              <h3 className="mt-5 text-lg font-bold text-[#0f172a]">{title}</h3>
              <p className="mt-3 leading-7 text-[#64748b]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Comparison ────────────────────────────────────────────────────────────────

function Comparison() {
  const rows = [
    { feature: "HD video calls", scribbl: true, zoom: true, miro: false },
    { feature: "Collaborative whiteboard", scribbl: true, zoom: false, miro: true },
    { feature: "Real-time rich notes", scribbl: true, zoom: false, miro: false },
    { feature: "Course-organized chat", scribbl: true, zoom: false, miro: false },
    { feature: "Session recordings", scribbl: true, zoom: "Paid add-on", miro: false },
    { feature: "File sharing", scribbl: true, zoom: "Limited", miro: "Limited" },
    { feature: "Math & LaTeX support", scribbl: true, zoom: false, miro: false },
    { feature: "PDF export", scribbl: true, zoom: false, miro: "Paid" },
    { feature: "All in one workspace", scribbl: true, zoom: false, miro: false },
  ];

  return (
    <section id="comparison" className="bg-[#f8f9ff] py-24">
      <div className="mx-auto max-w-5xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#6366f1]">Comparison</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
            A complete replacement for Zoom + Miro
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#64748b]">
            Scribbl gives you everything both tools offer — plus notes, file sharing,
            and recordings — in a single workspace your whole class can use.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                <th className="px-6 py-4 text-left font-semibold text-[#0f172a]">Feature</th>
                <th className="px-6 py-4 text-center font-semibold text-[#6366f1]">Scribbl</th>
                <th className="px-6 py-4 text-center font-medium text-[#94a3b8]">Zoom</th>
                <th className="px-6 py-4 text-center font-medium text-[#94a3b8]">Miro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ feature, scribbl, zoom, miro }, i) => (
                <tr key={feature} className={i < rows.length - 1 ? "border-b border-[#f1f5f9]" : ""}>
                  <td className="px-6 py-4 font-medium text-[#475569]">{feature}</td>
                  <td className="px-6 py-4 text-center">
                    <ComparisonCell value={scribbl} primary />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <ComparisonCell value={zoom} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <ComparisonCell value={miro} />
                  </td>
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
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${primary ? "bg-[#6366f1] text-white" : "bg-[#dcfce7] text-[#16a34a]"}`}>
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
        <X size={13} strokeWidth={3} />
      </span>
    );
  }
  return <span className="text-xs font-medium text-[#f59e0b]">{value}</span>;
}

// ── Security ──────────────────────────────────────────────────────────────────

function Security() {
  const points = [
    {
      icon: <Lock size={20} />,
      title: "Encrypted in transit and at rest",
      body: "All sessions, notes, and files are encrypted using TLS. Data at rest is encrypted by Supabase's hosted Postgres and S3-compatible storage.",
    },
    {
      icon: <Users size={20} />,
      title: "Role-based access control",
      body: "Every workspace has OWNER, ADMIN, and MEMBER roles. Per-session permission overrides let moderators control who can write, draw, or speak.",
    },
    {
      icon: <Shield size={20} />,
      title: "Full audit logs",
      body: "Every key action is logged: member invites, role changes, file uploads, recording starts, and ownership transfers — visible to workspace owners.",
    },
    {
      icon: <BookOpen size={20} />,
      title: "Your data stays yours",
      body: "We never sell or share your data with third parties. Scribbl is designed to be FERPA-friendly for educational institutions.",
    },
  ];

  return (
    <section id="security" className="py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] to-[#1e293b] px-8 py-16 sm:px-14 lg:px-20">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-[#818cf8]">
              For Institutions
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Built for institutions that care about data
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#94a3b8]">
              Educational institutions, tutoring centres, and corporate teams trust
              Scribbl because their data is handled with the care they demand.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {points.map(({ icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-[#334155] bg-[#1e293b] p-7">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#312e81] text-[#818cf8]">
                  {icon}
                </div>
                <h3 className="mt-5 text-base font-bold text-white">{title}</h3>
                <p className="mt-2 leading-7 text-[#94a3b8]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────

// ── Pricing ───────────────────────────────────────────────────────────────────

function LandingPricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      per: "",
      description: "For small groups getting started.",
      cta: "Get started free",
      href: "/login",
      highlight: false,
      features: [
        "Up to 3 workspaces",
        "Up to 5 members per workspace",
        "Video calls, notes, whiteboards, chat",
        "File sharing (500 MB)",
        "PDF export",
        "✗ Meeting recordings",
        "✗ Groups",
      ],
    },
    {
      name: "Pro",
      price: "$20",
      per: "CAD / workspace / month",
      description: "Everything your team needs.",
      cta: "Get started",
      href: "/login",
      highlight: true,
      features: [
        "Unlimited workspaces",
        "Unlimited members",
        "Video calls, notes, whiteboards, chat",
        "File sharing (10 GB)",
        "PDF export",
        "Meeting recordings",
        "Groups",
      ],
    },
    {
      name: "Institution",
      price: "$299",
      per: "CAD / month",
      description: "For schools and companies.",
      cta: "Contact us",
      href: "mailto:billing@scribblapp.ca?subject=Scribbl Institution Plan",
      highlight: false,
      features: [
        "Unlimited workspaces (org-wide)",
        "Unlimited members",
        "Everything in Pro",
        "100 GB storage",
        "Audit logs",
        "Priority support",
        "Invoice billing",
      ],
    },
  ];

  return (
    <section id="pricing" className="bg-[#f8f9ff] py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#6366f1]">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#64748b]">
            One workspace, one price. No per-seat fees. Cancel anytime.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {tiers.map(({ name, price, per, description, cta, href, highlight, features }) => (
            <div
              key={name}
              className={`flex flex-col rounded-2xl p-8 ${
                highlight
                  ? "border-2 border-[#6366f1] bg-white shadow-lg shadow-indigo-100"
                  : "border border-[#e2e8f0] bg-white shadow-sm"
              }`}
            >
              {highlight ? (
                <span className="mb-3 w-fit rounded-full bg-[#f0f0fe] px-3 py-1 text-xs font-semibold text-[#6366f1]">
                  Most popular
                </span>
              ) : null}
              <p className="text-sm font-semibold uppercase tracking-widest text-[#64748b]">{name}</p>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold text-[#0f172a]">{price}</span>
                {per ? <span className="mb-1 text-xs text-[#94a3b8]">{per}</span> : null}
              </div>
              <p className="mt-2 text-sm text-[#64748b]">{description}</p>

              <Link
                href={href}
                className={`mt-7 block rounded-xl px-5 py-3 text-center text-sm font-semibold transition ${
                  highlight
                    ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:opacity-90"
                    : "border border-[#e2e8f0] text-[#0f172a] hover:border-[#6366f1] hover:text-[#6366f1]"
                }`}
              >
                {cta}
              </Link>

              <ul className="mt-7 grid gap-2.5 text-sm text-[#475569]">
                {features.map((f) => (
                  <li key={f} className={`flex items-start gap-2 ${f.startsWith("✗") ? "text-[#94a3b8]" : ""}`}>
                    <span className={`mt-0.5 shrink-0 ${f.startsWith("✗") ? "text-[#cbd5e1]" : "text-[#6366f1]"}`}>
                      {f.startsWith("✗") ? "✗" : "✓"}
                    </span>
                    {f.startsWith("✗") ? f.slice(2) : f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-[#94a3b8]">
          Taxes calculated at checkout. Prices in Canadian dollars.{" "}
          <Link href="/pricing" className="font-medium text-[#6366f1] hover:underline">
            Full comparison →
          </Link>
        </p>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="bg-[#f8f9ff] py-24">
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-[#0f172a] sm:text-4xl lg:text-5xl">
          Ready to transform how your students learn?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#64748b]">
          Create your first workspace in seconds. No credit card required.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-200 transition hover:opacity-90"
          >
            Create your workspace <ArrowRight size={16} />
          </Link>
          <a
            href="#features"
            className="rounded-xl border border-[#e2e8f0] bg-white px-8 py-3.5 text-base font-semibold text-[#0f172a] transition hover:border-[#6366f1] hover:text-[#6366f1]"
          >
            See all features
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="border-t border-[#e2e8f0] bg-white">
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

        <p className="text-sm text-[#94a3b8]">
          © {new Date().getFullYear()} Scribbl. All rights reserved.
        </p>

        <nav className="flex items-center gap-6">
          <Link href="/login" className="text-sm text-[#64748b] transition hover:text-[#0f172a]">
            Sign in
          </Link>
          <a href="#security" className="text-sm text-[#64748b] transition hover:text-[#0f172a]">
            Security
          </a>
          <a href="mailto:hello@scribblapp.ca" className="text-sm text-[#64748b] transition hover:text-[#0f172a]">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
