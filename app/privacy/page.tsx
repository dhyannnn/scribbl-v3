import Link from "next/link";

export const metadata = { title: "Privacy Policy — Scribbl" };

const EFFECTIVE_DATE = "May 22, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <Link href="/" className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
          ← Back to Scribbl
        </Link>

        <h1 className="mt-6 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[var(--color-subtle)]">Effective date: {EFFECTIVE_DATE}</p>

        <div className="prose mt-10 max-w-none space-y-8 text-[var(--color-muted)] [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[var(--color-text)] [&_h2]:mt-8 [&_a]:text-[var(--color-secondary)] [&_a]:underline">

          <p>Scribbl (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is committed to protecting your privacy. This policy explains what information we collect, how we use it, and what choices you have.</p>

          <h2>1. Information we collect</h2>
          <p><strong>Account information:</strong> When you create an account we collect your email address, display name, and optionally a profile photo. This information is provided by you or by your OAuth provider (Google, GitHub).</p>
          <p><strong>Workspace content:</strong> Notes, whiteboards, chat messages, files, and meeting recordings you create inside Scribbl are stored on our servers. This content belongs to you.</p>
          <p><strong>Usage data:</strong> We collect standard server logs including IP addresses, browser type, pages visited, and feature interactions. This helps us diagnose problems and improve the product.</p>
          <p><strong>Payment information:</strong> Billing is handled by Stripe. We never store your full card number. We receive a customer ID and subscription status from Stripe.</p>

          <h2>2. How we use your information</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To provide, operate, and improve the Scribbl service</li>
            <li>To send you transactional emails (account confirmations, billing receipts, meeting invitations)</li>
            <li>To respond to support requests</li>
            <li>To detect and prevent abuse, fraud, or security incidents</li>
            <li>To comply with legal obligations</li>
          </ul>
          <p>We do not sell your personal data to third parties. We do not use your content to train AI models.</p>

          <h2>3. Data storage and security</h2>
          <p>Your data is stored on servers provided by Supabase (PostgreSQL database and file storage). Data is encrypted in transit using TLS and at rest using AES-256. Real-time collaboration features are powered by Liveblocks. Video calls are powered by LiveKit.</p>
          <p>We take reasonable technical and organizational measures to protect your data, but no system is completely secure. Please use a strong, unique password and enable any available two-factor authentication.</p>

          <h2>4. Data retention</h2>
          <p>We retain your account data for as long as your account is active. If you delete your account, your personal information is removed within 30 days. Workspace content is retained as long as the workspace exists. Owners can delete a workspace and all associated data at any time from workspace settings.</p>

          <h2>5. Cookies</h2>
          <p>We use session cookies for authentication. We do not use third-party advertising cookies. Analytics, if any, are limited to privacy-respecting tools that do not track you across sites.</p>

          <h2>6. Third-party services</h2>
          <p>Scribbl integrates with the following third-party services, each with their own privacy policies:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Supabase — database and storage</li>
            <li>Liveblocks — real-time collaboration</li>
            <li>LiveKit — video and audio</li>
            <li>Stripe — payment processing</li>
            <li>Resend — transactional email</li>
          </ul>

          <h2>7. Your rights</h2>
          <p>Depending on your location, you may have the right to access, correct, export, or delete your personal data. To exercise any of these rights, email us at <a href="mailto:inquiry@scribblapp.ca">inquiry@scribblapp.ca</a>. We will respond within 30 days.</p>

          <h2>8. Children</h2>
          <p>Scribbl is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.</p>

          <h2>9. Changes to this policy</h2>
          <p>We may update this policy from time to time. When we do, we will update the effective date at the top of this page. For significant changes we will notify you by email or via an in-app notice.</p>

          <h2>10. Contact</h2>
          <p>Questions about this policy? Email us at <a href="mailto:inquiry@scribblapp.ca">inquiry@scribblapp.ca</a>.</p>
        </div>
      </div>
    </main>
  );
}
