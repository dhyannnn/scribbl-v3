# Scribbl MVP Handoff — May 21, 2026 (Session 4)

## Project
**Path:** `/Users/Karuna/Desktop/Dhyan/Scribbl/scribbl`
**Run:** `npm run dev` → http://localhost:3000
**Tests:** `npm test` → 121 passing (16 test files)
**TypeScript:** 0 errors
**Domain:** scribblapp.ca
**GitHub:** github.com/dhyannnn/scribbl-v3

---

## Critical Gotchas — Read First

1. **DATABASE_URL → live Supabase. NEVER `prisma migrate dev`. Use `npx prisma migrate deploy` only.**
2. **`.npmrc` has `legacy-peer-deps=true`** — required for tldraw 3.0.2 + React 19. Do not remove.
3. **TipTap CollaborationCursor v3 is broken** — use `lib/tiptap/liveblocks-cursors.ts`. Never re-enable CollaborationCursor.
4. **TipTap Yjs must be deferred** — outer shell waits for sync, `TextNoteEditorInner` only mounts when ready.
5. **tldraw Yjs sync and presence must be in separate useEffects** — merging causes Liveblocks token refresh flashes.
6. **Dev server MUST restart after `prisma generate`** — Turbopack caches old Prisma client. Kill port 3000: `lsof -ti:3000 | xargs kill -9`, then `npm run dev`.
7. **Inline `as import("@prisma/client").XXX[]` type assertions inside Prisma queries break at runtime with Turbopack.** Import the type at the top of the file and declare: `const arr: AuditAction[] = [...]`.
8. **Server components cannot have onClick handlers** — use `<form>` with server actions or extract to "use client" component.
9. **Stripe webhooks 404 on localhost** — use `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
10. **Chat URL is `/workspaces/[id]/chat/[channelId]`** — NOT the old `?channel=ID` format.
11. **AppSidebar has NO plan badge** — billing is per-workspace, not per-account. Plan info lives in WorkspaceSidebar.
12. **RealtimeChatPanel variants:** `variant="fullscreen"` (fills parent, no border), default `"card"` (for meeting hub).
13. **`cancelMeeting` reads `cancelScope` from formData** — `"THIS"` or `"THIS_AND_FUTURE"`.
14. **`updateMeetingDetails` reads `editScope` from formData** — `"THIS"`, `"THIS_AND_FUTURE"`, or `"ALL"`.
15. **Stripe API 2026-04-22.dahlia: `current_period_start`/`end` absent from Subscription type** — access as `(stripeSub as any).current_period_start`. Both sync functions guard with `if (rawPeriodStart)` before writing.
16. **Stripe `invoiceItems.create` uses `pricing: { price: priceId }`** — NOT top-level `price`. See `lib/stripe-overage.ts`.
17. **`lib/env.ts` validates 5 required `STRIPE_PRICE_*` env vars at startup** — server won't start if missing.
18. **Stripe checkout MUST set `subscription_data: { metadata: { workspaceId } }`** — `upgradeWorkspaceToPlan` does this. Without it, `handleInvoiceCreated` can't find the workspace.
19. **tldraw image upload: `ScribblToolbar` omits `AssetToolbarItem` when `canUploadAssets=false`** — plus `registerExternalContentHandler("files", () => {})` for drag/drop. Both active as belt-and-suspenders.
20. **Recording action uses `workspacePlan.plan` (not `subscription.plan`) for hour checks** — `subscription.plan` can lag Stripe sync and was causing Pro workspaces to be incorrectly blocked. Fixed in session 4.
21. **`WorkspaceSidebarShell` hydration** — `useState(true)` as SSR default, `useEffect` corrects from localStorage. Never initialize sidebar open state from localStorage in `useState()` — causes hydration mismatch.
22. **`WorkspaceSidebar` uses `h-full flex-col` (not `fixed`)** — positioned by the shell container. Do not re-add `fixed inset-y-0 left-0`.
23. **Split video CSS uses `--scribbl-sidebar-w`** — `WorkspaceSidebarShell` sets this CSS var on `documentElement`. The split panel CSS subtracts it: `calc(100vw - var(--scribbl-sidebar-w, 0px) - var(--scribbl-video-split-width))`.
24. **Notes auto-expand on open** — `NoteEditorShell` starts with `useState(true)`. This is intentional.
25. **`VisibilityDropdown`** is a shared client component at `components/VisibilityDropdown.tsx` — used in both `TextNoteEditor` and `TldrawWhiteboardEditor` document/goodnotes variants.

---

## Stack
Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Prisma 7 · Supabase (Postgres/Auth/Storage) · Liveblocks + Yjs · LiveKit · Resend · TipTap v3 · tldraw v3.0.2 · Playwright Chromium (PDF export) · Vitest · Stripe v22 (SDK 22.1.1, API 2026-04-22.dahlia)

---

## Design System (P7)

**Fonts** — loaded via `next/font/google` in `app/layout.tsx`, CSS vars on `<html>`:
- `--font-hanken` → Hanken Grotesk → `font-display` class (headlines)
- `--font-inter` → Inter → `font-sans` class (body, default)
- `--font-jetbrains` → JetBrains Mono → `font-mono` class (labels, tags)

**Colors** — CSS custom properties in `app/globals.css` via `@theme inline`:
- `--color-bg`: #f9f9ff · `--color-surface`: #ffffff · `--color-surface-low`: #eff4ff
- `--color-surface-mid`: #ededf4 · `--color-surface-high`: #e8e7ee
- `--color-text`: #1a1b20 · `--color-muted`: #45464d · `--color-subtle`: #7e7576
- `--color-border`: #c6c6cd · `--color-border-strong`: #9e9ea6
- `--color-primary`: #000000 (buttons) · `--color-secondary`: #085ac0 (CTAs, active states)
- `--color-secondary-hover`: #2170e4 · `--color-secondary-dim`: #d8e2ff
- `--color-live`: #131b2e (video room background)
- `--color-danger`: #ba1a1a · `--color-danger-dim`: #ffdad6
- `--color-success`: #1a6b3c · `--color-success-dim`: #d3f0e3
- `--color-warning`: #7a5200 · `--color-warning-dim`: #fdefc3

**Shape rules:** buttons/inputs = `rounded-full`, cards = `rounded-2xl`, avatars = `rounded-full`
**Layout:** collapsible 256px sidebar (see WorkspaceSidebarShell), max content width `max-w-[1100px]`

---

## Layout Architecture

```
app/layout.tsx                              ← root, fonts only
app/(app)/layout.tsx                        ← AppSidebar (dashboard, notifications, global calendar)
app/workspaces/[id]/layout.tsx              ← WorkspaceSidebarShell (collapsible sidebar)
app/workspaces/[id]/meetings/[id]/layout.tsx ← bare pass-through (full-screen meeting hub)
app/workspaces/[id]/notes/[id]/layout.tsx   ← bare pass-through (full-screen editor)
```

**Key components:**
- `components/WorkspaceSidebarShell.tsx` — "use client", manages open/close (default closed in meeting contexts), sets `--scribbl-sidebar-w`, `h-screen overflow-hidden` layout so sidebar and content scroll independently, mobile off-canvas overlay
- `components/WorkspaceSidebar.tsx` — server component, `h-full flex-col` (NOT fixed)
- `components/NavLink.tsx` — "use client", usePathname() for active states
- `components/RealtimeChatPanel.tsx` — fullscreen/card variants
- `components/VisibilityDropdown.tsx` — "use client", shared visibility picker used in both editors
- `lib/color-hash.ts` — `getGradient(title)` and `getInitials(name)` for note/workspace card thumbnails

---

## What Is Fully Built

### Auth & Account
Sign in/out, profile, password, account deletion, avatar upload, notification preferences.

### Workspace & Billing
TEAM/PROJECT/CLASS workspace types, OWNER/ADMIN/MEMBER roles. Full Stripe v22 billing with checkout, Customer Portal, overage billing, plan enforcement. See Billing section below.

### Groups (Pro-gated), Meetings, Recurring Meetings, Calendar
All fully built. See HANDOFF_MAY19.md for details.

### Chat (complete)
Multi-channel: Announcements + CHAT channels per workspace. Chat URL: `/workspaces/[id]/chat/[channelId]`.

### Dashboard, Workspace Home
Activity feed, workspace grid (with gradient thumbnails + initials avatars), pending invites, upcoming meetings, mini calendar.

### Notes & Whiteboards — FULLY REDESIGNED (P7 complete)

**Text notes (document variant — auto-expands on open):**
- Top bar: editable title (Yjs-synced), presence avatars, Export PDF (gated Free/Pro), Share ("Copied!" feedback), Visibility dropdown, icon-only Collapse button
- Toolbar: all design tokens, `rounded-full` buttons, `flat` prop for document mode
- Bottom bar: autosave dot + status, word count, char count, zoom (−/select/+), Save Note button
- Page-break lines every 1056px via CSS gradient on `.ProseMirror` + `background-attachment: local`

**Whiteboards (goodnotes variant — auto-expands on open):**
- Header: pencil icon, editable title, AUTOSAVED status, presence avatars, Export PDF (gated), Share ("Copied!"), Visibility dropdown, icon-only Collapse
- Real zoom tracking from tldraw store listener, zoom in/out buttons
- Footer: save status dot + Save Whiteboard button
- Card variant: design tokens throughout (title input rounded-full, no old green)

**Note page (collapsed view):**
- Shows actual note title (not "Note Editor")
- Design tokens throughout
- Compact export access form

**Whiteboard gating:**
| Context | Free | Pro+ |
|---|---|---|
| Private whiteboard | ✓ edit | ✓ edit |
| Shared whiteboard | view-only | ✓ edit |
| PDF export | ✗ | ✓ |
| Image uploads | ✗ | ✓ |

### Files
Upload/open/download/rename/delete. Storage limit gating, split shared/private storage display.

### Video Room (C10 — fully redesigned)

**Standalone video page (`/workspaces/.../video`):**
- App color palette (light background, design tokens throughout)
- Status strip: Participants, Hands, Recording, Requests — using app `StatusPill` component
- Video section fills viewport: `min-h-[calc(100vh-200px)]`
- Side panel (Chat/People/Meeting) fully updated to app palette

**Video tiles:**
- `auto-rows-fr` grid — tiles fill available height, not `aspect-video`
- 2 participants → 2 columns full height
- Dark tile bg `#0f1929` on navy `--color-live` backdrop

**Controls pill (full mode):**
- `▸/▾` toggle at far left — collapses all controls, always shows Leave
- `LayoutGrid/Crosshair` — gallery/spotlight view toggle (spotlight = active speaker only)
- `Maximize2/Minimize2` — fullscreen via HTML5 Fullscreen API
- `Circle/Square` — Rec/Stop (filled icons)
- `ChevronDown/ChevronRight` — hide/show toggle
- Leave → navigates to hub via `onAfterLeave` callback

**Recording:** `workspacePlan.plan` used for hour limit check (not stale `subscription.plan`).

**FloatingMeetingVideo panel:**
- Chrome (header + buttons) uses `--color-surface` + design tokens
- Panel border `--color-border`, buttons `rounded-full` app style

### Sidebar
- `WorkspaceSidebarShell` client component wraps all workspace pages
- `◁/▷` toggle button rides the right edge
- Preference persisted to localStorage; `useEffect`-corrected (SSR-safe)
- Auto-closes in meeting contexts by default
- Mobile: off-canvas overlay with hamburger

### Thumbnails (`lib/color-hash.ts`)
- Note cards: 88px gradient header (8-color palette, deterministic from title), icon + type label
- Workspace cards: 64px gradient header with initials badge

### Note Visibility
`updateNoteVisibility` server action: shared notes → owner/admin can change; private notes → only owner. `VisibilityDropdown` shared component in both editor top bars.

---

## Billing — Complete

See HANDOFF_MAY19.md for full pricing model, Stripe env vars, webhook events, and feature gates. Key addition this session:

**Recording action fix:** `startMeetingRecording` now uses `workspacePlan.plan` (fetched fresh from DB, already verified non-FREE) for `getIncludedRecordingHours()` instead of `subscription.plan` which can be stale if Stripe price ID mapping changes. This prevented Pro workspaces from recording.

---

## Migrations — Complete Status

**Deployed to live DB:**
- `20260517130000_add_recurring_meetings` ✓
- `20260518000000_billing_overhaul` ✓

**Still to run (batch together when building those features):**
1. User profile: `institution`, `jobTitle`, `timezone`, `language`, `bio`, `darkMode` on User
2. Chat features: `MessageReaction`, `Message.attachmentFileId/replyToId/isPinned`, `ChannelType.DIRECT`
3. Tags: `Tag`, `NoteTag`, `MeetingTag`, `FileTag` tables

---

## MVP Todo List — Session 4 Status

### ✅ Done (Groups 1–6, whiteboard, video room, thumbnails, sidebar)

**Group 3: Text editor** — ✅ Items 7, 8, 9 complete
**Group 4: Whiteboard** — ✅ Items 10, 11, 12 complete (top bar, toolbar restyle, card variant)
**Group 6: Video room** — ✅ Item 14 complete
**Group 12: Thumbnails** — ✅ Item 32 complete

### Remaining — No schema changes

**Group 5: Slash commands**

**13. Slash commands** — `components/TextNoteEditor.tsx`
- `@tiptap/suggestion` (check if already a transitive dep before installing)
- Create `lib/tiptap/slash-commands.ts`. Commands: H1/H2/H3, bullet, numbered list, code block, KaTeX math, table, divider, quote
- Trigger: `/` key → floating dropdown → Enter or click to insert

**Group 9: Command palette**

**19. Command palette (⌘K)** — new `components/CommandPalette.tsx` + `app/layout.tsx`
- Keyboard shortcut: `(e.metaKey || e.ctrlKey) && e.key === 'k'` → open/close
- Modal overlay: `fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[20vh]`
- Create `/api/command-search?q=X` — queries notes, meetings, workspaces, channels for current user
- Sections: Recent, Workspaces, Notes, Meetings, Actions. Press Enter or click to navigate
- Add `<CommandPalette />` to `app/(app)/layout.tsx`

**Group 10: Global search**

**20. Global search** — `app/(app)/search/page.tsx`
- Server component, `?q=search+term` URL param
- Sections: Notes, Meetings, Files, Chat messages — grouped by type with icons

**Group 13: Tutorials**

**33. Onboarding modal** — `components/OnboardingModal.tsx`
- 4 steps. `localStorage.getItem('onboarding-complete')` gate
- Add to `app/(app)/layout.tsx`

**34. /help docs page** — `app/(app)/help/page.tsx`
- Static server component, `<details><summary>` accordion sections
- Link from AppSidebar footer

**Group 1: Landing page**

**1. C11 Landing page** — `components/LandingPage.tsx`
- Structure and pricing exist. Still needs: Before/After section, Features with real screenshots, How it works, About, Meet the Team, CTA + footer
- `public/screen.png` — text editor hero. `public/Screenshot 2026-05-17 at 1.11.45 PM.png` — whiteboard hero
- Positioning: general-purpose (teams, companies, labs, departments)

### Requires schema migration (batch when ready)

**Group 7: Account & billing pages**

**15. User schema extension** — Add to `User` model:
```
institution TEXT, jobTitle TEXT, timezone TEXT DEFAULT 'UTC',
language TEXT DEFAULT 'en', bio TEXT, darkMode BOOLEAN DEFAULT false
```

**16. Account page redesign** — `app/account/page.tsx`
- Profile photo, display name, email (read-only)
- New fields: institution, jobTitle dropdown, bio textarea
- Notification toggles as iOS-style toggles
- Timezone + language dropdowns
- "Support Center" card → `/help`

**Group 8: Dark/light mode** (needs item 15)

**18. Light/dark mode** — `[data-theme="dark"]` block in `app/globals.css`, `ThemeToggle` component, `app/layout.tsx` fetch `darkMode` on load

**Group 11: Chat features** (needs migration — batch all together)

**21–30:** Message reactions, file attachments, code blocks, LaTeX, link unfurl, threading, @mentions, message pinning, channel search, direct messages. See HANDOFF_MAY19.md for full schema SQL.

**Group 12: Tags** (needs migration)

**31. Tags & labels** — `Tag`, `NoteTag`, `MeetingTag`, `FileTag` tables

---

## Deployment Checklist (P8 — after all MVP items done)

- Hosting: Railway or Fly.io (Playwright Chromium needs persistent runtime — NOT Vercel serverless)
- Stripe live mode: complete identity verification, switch to live keys, recreate 5 products + price IDs, new webhook endpoint, add `invoice.created`
- tldraw: email sales@tldraw.com for startup pricing; start 100-day trial at tldraw.dev/get-a-license/trial on deployment day
- Supabase: upgrade to Pro ($25/mo), use Session Pooler URL for `DATABASE_URL` in production
- Resend: configure DKIM/SPF/DMARC for scribblapp.ca
- Email forwarding: `billing@scribblapp.ca` and `hello@scribblapp.ca` via ImprovMX before launch

---

## Start Here Next Session

```
Project: /Users/Karuna/Desktop/Dhyan/Scribbl/scribbl
Run: npm run dev → localhost:3000
GitHub: github.com/dhyannnn/scribbl-v3

GIT STATUS:
- All Session 4 changes are UNCOMMITTED. Do not commit unless Dhyan asks.
- TypeScript: 0 errors. Lint: 1 pre-existing warning in tests/unit/artifact-lock.test.ts (ignore).

MIGRATION STATUS:
- 20260517130000_add_recurring_meetings: DEPLOYED ✓
- 20260518000000_billing_overhaul: DEPLOYED ✓
- Next batch (user profile + chat + tags): NOT YET — batch when ready to build those features.

STRIPE SETUP REQUIRED (manual — still pending):
1. Create 5 products in Stripe test mode (Pro base $25 CAD, Institution base $65 CAD,
   Pro member overage $1, Institution member overage $0.50, Recording hour $1.50)
2. Set STRIPE_PRICE_* env vars with the new price IDs
3. Add invoice.created to webhook endpoint enabled events
4. Run refreshBillingStatus on billing page after setup

WHAT WAS DONE IN SESSION 4:
- P7 redesign complete: C1–C10 all done
- Text editor (items 7–9): document top bar, toolbar restyle, bottom bar, real zoom, page breaks
- Whiteboard (items 10–12): goodnotes header/footer, card variant design tokens, real zoom
- Note visibility: server action + VisibilityDropdown shared component
- Note page: shows actual title, design tokens throughout
- Thumbnails (item 32): gradient headers on note cards, initials avatars on workspace cards
- Video room (item 14): floating pill controls with Lucide icons, gallery/spotlight, fullscreen,
  leave navigates to hub, recording compact inline buttons, tiles fill height, app color palette
- Sidebar: WorkspaceSidebarShell (collapsible, responsive, SSR-safe, h-screen layout)
- Bug fixes: recording Pro plan check, permissions overflow, split video layout, hydration error

RECOMMENDED NEXT ITEMS (in order):
1. Item 13: Slash commands — makes text editor feel like Notion
2. Items 33+34: Onboarding modal + help page — small tasks, needed for launch
3. Item 19: Command palette (⌘K) — highest remaining UX impact
4. Schema migration for items 15+16+18 (user profile + account + dark mode)
5. Item 20: Global search
6. C11: Landing page (content-heavy, needs real screenshots)
```
