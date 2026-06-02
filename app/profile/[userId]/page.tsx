import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

type Props = { params: Promise<{ userId: string }> };

export async function generateMetadata({ params }: Props) {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    select: { displayName: true },
  });
  return { title: user ? `${user.displayName} — Scribbl` : "Profile — Scribbl" };
}

export default async function PublicProfilePage({ params }: Props) {
  const { userId } = await params;

  const [profileUser, currentUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        jobTitle: true,
        institution: true,
        linkedinUrl: true,
        githubUrl: true,
        websiteUrl: true,
        twitterUrl: true,
        createdAt: true,
      },
    }),
    getCurrentUser(),
  ]);

  if (!profileUser) notFound();

  const isOwnProfile = currentUser?.id === profileUser.id;

  // Find shared workspaces if viewing someone else's profile
  const sharedWorkspaces = !isOwnProfile && currentUser
    ? await prisma.workspace.findMany({
        where: {
          AND: [
            { members: { some: { userId: currentUser.id, status: "ACTIVE" } } },
            { members: { some: { userId: profileUser.id, status: "ACTIVE" } } },
          ],
        },
        select: { id: true, name: true, type: true },
        take: 6,
      })
    : [];

  const initials = profileUser.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const memberSince = profileUser.createdAt.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
  });

  const hasDetails = profileUser.bio || profileUser.jobTitle || profileUser.institution;

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">

      {/* Hero */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
          <Link href="/" className="text-sm font-medium text-[var(--color-secondary)] hover:underline">
            ← Back
          </Link>

          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8">
            {/* Avatar */}
            {profileUser.avatarUrl ? (
              <img
                src={profileUser.avatarUrl}
                alt={profileUser.displayName}
                className="h-24 w-24 shrink-0 rounded-2xl object-cover shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-secondary-dim)] shadow-md">
                <span className="font-display text-3xl font-bold text-[var(--color-secondary)]">{initials}</span>
              </div>
            )}

            {/* Name + meta */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div>
                <h1 className="font-display text-3xl font-bold text-[var(--color-text)]">
                  {profileUser.displayName}
                </h1>
                {(profileUser.jobTitle || profileUser.institution) ? (
                  <p className="mt-1 text-[var(--color-muted)]">
                    {[profileUser.jobTitle, profileUser.institution].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1 font-mono text-xs text-[var(--color-subtle)]">
                  Member since {memberSince}
                </span>
                {sharedWorkspaces.length > 0 ? (
                  <span className="rounded-full border border-[var(--color-secondary-dim)] bg-[var(--color-secondary-dim)] px-3 py-1 font-mono text-xs text-[var(--color-secondary)]">
                    {sharedWorkspaces.length} shared workspace{sharedWorkspaces.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>

              <SocialLinks
                linkedin={profileUser.linkedinUrl}
                github={profileUser.githubUrl}
                website={profileUser.websiteUrl}
                twitter={profileUser.twitterUrl}
              />

              {isOwnProfile ? (
                <Link
                  href="/account"
                  className="w-fit rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
                >
                  Edit profile
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6">

          {/* Bio */}
          {profileUser.bio ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">About</p>
              <p className="mt-3 leading-7 text-[var(--color-muted)]">{profileUser.bio}</p>
            </div>
          ) : null}

          {/* Shared workspaces */}
          {sharedWorkspaces.length > 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Shared workspaces
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {sharedWorkspaces.map((ws) => (
                  <Link
                    key={ws.id}
                    href={`/workspaces/${ws.id}/members`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-low)] px-4 py-3 transition hover:border-[var(--color-secondary)] hover:bg-[var(--color-secondary-dim)]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary-dim)] text-[var(--color-secondary)]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">{ws.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">{ws.type.toLowerCase()}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {/* Message CTA in first shared workspace */}
              {!isOwnProfile && sharedWorkspaces[0] ? (
                <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                  <Link
                    href={`/workspaces/${sharedWorkspaces[0].id}/members`}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Send a message
                  </Link>
                  <p className="mt-2 text-xs text-[var(--color-subtle)]">Opens the members page where you can start a DM.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Empty states */}
          {!hasDetails && isOwnProfile ? (
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-8 text-center">
              <p className="text-sm font-medium text-[var(--color-text)]">Your profile is empty</p>
              <p className="mt-1 text-sm text-[var(--color-subtle)]">
                Add a bio, job title, and institution so your teammates know who you are.
              </p>
              <Link
                href="/account"
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-secondary-hover)]"
              >
                Complete your profile
              </Link>
            </div>
          ) : null}

          {!hasDetails && !isOwnProfile ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-8 text-center shadow-sm">
              <p className="text-sm text-[var(--color-subtle)]">
                {profileUser.displayName.split(" ")[0]} hasn&apos;t added any profile details yet.
              </p>
            </div>
          ) : null}

          {sharedWorkspaces.length === 0 && !isOwnProfile && currentUser ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 text-center shadow-sm">
              <p className="text-sm text-[var(--color-subtle)]">
                You don&apos;t share any workspaces with {profileUser.displayName.split(" ")[0]}.
              </p>
            </div>
          ) : null}

        </div>
      </div>
    </main>
  );
}

function SocialLinks({ linkedin, github, website, twitter }: {
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
  twitter?: string | null;
}) {
  const links = [
    {
      href: linkedin,
      label: "LinkedIn",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
    },
    {
      href: github,
      label: "GitHub",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      ),
    },
    {
      href: website,
      label: "Website",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      href: twitter,
      label: "Twitter / X",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
  ].filter((l) => !!l.href);

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-low)] text-[var(--color-muted)] transition hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)]"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}
