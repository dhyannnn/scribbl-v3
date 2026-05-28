import Link from "next/link";

export const metadata = { title: "Terms of Service — Scribbl" };

const EFFECTIVE_DATE = "May 22, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <Link href="/" className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
          ← Back to Scribbl
        </Link>

        <h1 className="mt-6 font-display text-4xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-[var(--color-subtle)]">Effective date: {EFFECTIVE_DATE}</p>

        <div className="prose mt-10 max-w-none space-y-8 text-[var(--color-muted)] [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[var(--color-text)] [&_h2]:mt-8 [&_a]:text-[var(--color-secondary)] [&_a]:underline">

          <p>These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Scribbl. By creating an account or using Scribbl, you agree to these Terms. If you do not agree, do not use the service.</p>

          <h2>1. Your account</h2>
          <p>You must provide accurate information when creating an account. You are responsible for keeping your credentials secure and for all activity that occurs under your account. Notify us immediately at <a href="mailto:inquiry@scribblapp.ca">inquiry@scribblapp.ca</a> if you believe your account has been compromised.</p>
          <p>You must be at least 13 years old to use Scribbl. If you are using Scribbl on behalf of an organization, you represent that you have authority to bind that organization to these Terms.</p>

          <h2>2. Your content</h2>
          <p>You retain ownership of all content you create in Scribbl — notes, whiteboards, files, messages, and recordings. By uploading content you grant us a limited license to store, display, and transmit it solely for the purpose of providing the service to you.</p>
          <p>You are responsible for ensuring your content does not violate any applicable laws or third-party rights. We may remove content that violates these Terms or applicable law.</p>

          <h2>3. Acceptable use</h2>
          <p>You agree not to use Scribbl to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Upload, share, or transmit unlawful, harmful, or abusive content</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe the intellectual property rights of others</li>
            <li>Attempt to gain unauthorized access to any part of the service or its infrastructure</li>
            <li>Interfere with or disrupt the service or servers connected to it</li>
            <li>Use the service to send spam or unsolicited messages</li>
            <li>Reverse engineer, decompile, or extract source code from the service</li>
          </ul>

          <h2>4. Plans and billing</h2>
          <p>Scribbl offers free and paid plans. Paid plans are billed on a monthly basis per workspace through Stripe. Prices are in Canadian dollars (CAD) and do not include applicable taxes.</p>
          <p>You may cancel your subscription at any time through the billing portal. Your workspace will retain paid features until the end of the current billing period, then revert to the Free plan. No refunds are issued for partial billing periods unless required by applicable law.</p>
          <p>We reserve the right to change pricing with 30 days&apos; notice. Continued use after the notice period constitutes acceptance of the new pricing.</p>

          <h2>5. Service availability</h2>
          <p>We aim to keep Scribbl available at all times but cannot guarantee uninterrupted service. We may perform maintenance, apply updates, or suspend the service for operational reasons. We are not liable for any loss resulting from service downtime.</p>

          <h2>6. Termination</h2>
          <p>You may delete your account at any time from account settings. We may suspend or terminate your account if you violate these Terms or if we reasonably believe your use poses a risk to other users or to the service. Upon termination, your right to use Scribbl ceases immediately.</p>
          <p>Sections 2, 7, 8, and 9 survive termination.</p>

          <h2>7. Intellectual property</h2>
          <p>Scribbl and its original content, features, and functionality are owned by us and are protected by intellectual property laws. You may not copy, reproduce, distribute, or create derivative works from any part of the service without our express written permission.</p>

          <h2>8. Disclaimer of warranties</h2>
          <p>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE OR UNINTERRUPTED.</p>

          <h2>9. Limitation of liability</h2>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM YOUR USE OF THE SERVICE.</p>
          <p>OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF CAD $100 OR THE AMOUNT YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM.</p>

          <h2>10. Governing law</h2>
          <p>These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law principles.</p>

          <h2>11. Changes to these Terms</h2>
          <p>We may update these Terms from time to time. We will notify you of material changes by email or by posting a notice in the app. Continued use after the effective date of the revised Terms constitutes acceptance.</p>

          <h2>12. Contact</h2>
          <p>Questions about these Terms? Contact us at <a href="mailto:inquiry@scribblapp.ca">inquiry@scribblapp.ca</a>.</p>
        </div>
      </div>
    </main>
  );
}
