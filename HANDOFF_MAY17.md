# Scribbl MVP Handoff — May 17, 2026 (Session 2)

## Project
**Path:** `/Users/Karuna/Desktop/Dhyan/Scribbl/scribbl`
**Run:** `npm run dev` → http://localhost:3000
**Tests:** `npm test` → 121 passing (16 test files)
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
9. **Stripe webhooks 404 on localhost** — use `~/stripe listen --forward-to localhost:3000/api/stripe/webhook`.
10. **Chat URL is `/workspaces/[id]/chat/[channelId]`** — NOT the old `?channel=ID` format. All links have been updated.
11. **AppSidebar has NO plan badge** — billing is per-workspace, not per-account. Plan info lives in WorkspaceSidebar.
12. **RealtimeChatPanel variants:** `variant="fullscreen"` (fills parent, no border — for standalone chat page), default `"card"` (for meeting hub). The fullscreen variant now has `flex-1 min-h-0` to prevent composer from being pushed off-screen.
13. **`cancelMeeting` now reads `cancelScope` from formData** — `"THIS"` or `"THIS_AND_FUTURE"`. CancelMeetingForm passes it.
14. **`updateMeetingDetails` now reads `editScope` from formData** — `"THIS"`, `"THIS_AND_FUTURE"`, or `"ALL"`. The hub form renders a radio group when `meeting.seriesId` is set.

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
- `--color-live`: #131b2e (live session hero card background)
- `--color-danger`: #ba1a1a · `--color-danger-dim`: #ffdad6
- `--color-success`: #1a6b3c · `--color-success-dim`: #d3f0e3
- `--color-warning`: #7a5200 · `--color-warning-dim`: #fdefc3

**Shape rules:** buttons/inputs = `rounded-full`, cards = `rounded-2xl`, avatars = `rounded-full`
**Layout:** fixed 256px sidebar (`w-64`), max content width `max-w-[1100px]`

---

## Layout Architecture

```
app/layout.tsx                              ← root, fonts only
app/(app)/layout.tsx                        ← AppSidebar (dashboard, notifications, global calendar)
app/workspaces/[id]/layout.tsx              ← WorkspaceSidebar (all workspace pages)
app/workspaces/[id]/meetings/[id]/layout.tsx ← bare pass-through (full-screen meeting hub)
app/workspaces/[id]/notes/[id]/layout.tsx   ← bare pass-through (full-screen editor)
```

**Key components:**
- `components/AppSidebar.tsx` — server component, nav links: Dashboard, Calendar (/calendar), Notifications, Settings
- `components/WorkspaceSidebar.tsx` — server component, workspace nav + channels. Order: Announcements → CHAT → Meeting Chats (newest 15). Has Calendar link to `/workspaces/[id]/calendar`.
- `components/NavLink.tsx` — "use client", usePathname() for active states
- `components/RealtimeChatPanel.tsx` — fullscreen/card variants, avatar on every incoming message, resizable panel support
- `components/ChatPanelResizer.tsx` — drag handle between chat + right panel, updates `--scribbl-chat-panel-width` CSS var

---

## What Is Fully Built

### Auth & Account
Sign in/out, profile, password, account deletion, avatar upload, notification preferences.

### Workspace & Billing (P1-P5)
TEAM/PROJECT/CLASS workspace types, OWNER/ADMIN/MEMBER roles. Stripe v22 webhooks, checkout, Customer Portal. `lib/billing.ts`: FREE_MEMBER_LIMIT=5, FREE_WORKSPACE_LIMIT=3, 500MB/10GB storage. Feature gates: recordings, member invites, file uploads, workspace creation.

### Groups (P6)
Group management (Pro-gated), meeting scheduling with group scope, group-scoped notifications + emails, OWNER/ADMIN bypass on all meeting views.

### Meetings
Schedule/edit/cancel, RSVP, meeting hub with shared/private notes, whiteboards, files, chat, fullscreen panels, moderation, hand-raise, LiveKit video (autoJoin, floating PiP, split video, standalone tab, emoji reactions).

### Recurring Meetings (NEW — fully built + migrated)
- Schema: `RecurrenceFrequency` enum (DAILY/WEEKLY/BIWEEKLY/MONTHLY), `seriesId`, `recurrence`, `seriesIndex`, `recurrenceEndsAt` on Meeting
- **Migration `20260517130000_add_recurring_meetings` — DEPLOYED TO LIVE DB ✓ AND `prisma generate` RUN ✓**
- Schedule form: expandable "Repeat" section with frequency dropdown + end date picker
- When scheduled with recurrence: creates one `Meeting` row per occurrence, each with its own hub, notes, channel, recordings. Linked by `seriesId`. Max 365 instances.
- Edit scope on meeting hub: "This meeting only" / "This and all future" / "Entire series"
- Cancel scope on meeting hub: "This meeting only" / "This and all future occurrences"
- `↻ weekly` badge shown on recurring meeting cards in meetings list

### Calendar (NEW — fully built)
- **Workspace calendar:** `app/workspaces/[id]/calendar/page.tsx` — 4 views (month/week/day/agenda), URL-driven nav (`?view=month&date=YYYY-MM-DD`), links in WorkspaceSidebar
- **Global calendar:** `app/(app)/calendar/page.tsx` — same 4 views, queries meetings across ALL user workspaces, workspace name badge on every meeting pill/card, workspace pill links in header. Accessible via AppSidebar "Calendar" link.
- **Dashboard mini calendar:** month grid widget in dashboard right sidebar, blue dot on days with meetings, links to `/calendar`

### Chat (P7 — complete)
Multi-channel: Announcements + CHAT channels per workspace. Chat URL: `/workspaces/[id]/chat/[channelId]`. Right panel: Recent Notes, Pinned Files, All Channels, Members. Soft card layout with `p-3 gap-3` body, `rounded-2xl` panels. Resizable right panel (drag handle, 220–520px, CSS var `--scribbl-chat-panel-width`). Avatar shown on every incoming message.

### Dashboard (P7 — complete)
Live meeting hero card, workspace grid, pending invites, upcoming meetings, activity feed (15 items), mini calendar widget, "Your Workspaces" section. Uses `getWorkspaceActivity()` from `lib/activity.ts`.

### Workspace Home (P7 — complete)
Stats (members/notes/meetings), live session banner, settings collapsible, announcements panel (fetches latest 3 from ANNOUNCEMENT channels), meetings + notes + files grid sections.

### Notes & Whiteboards
TipTap v3 full toolbar, KaTeX math, indent, PDF export via Playwright, expand/collapse shell. tldraw v3 custom toolbar, templates, multi-page, export, autosave. Both with full Liveblocks collaboration.

### Files
Upload/open/download/rename/delete. Storage limit gating. Pin/unpin (OWNER/ADMIN, max 10 pinned per workspace). File shown in chat right panel when pinned.

### Recordings (Pro-gated)
LiveKit Egress → MP4 → Supabase S3 → MeetingRecording + MeetingArtifact + workspace File. `canRecord` prop chain: `meeting hub page.tsx → FloatingMeetingVideo → VideoPopoutShell → MeetingVideoRoom → ConferenceSurface → RecordingControls`.

### P7 Redesign Status
- ✅ C1: Login/Signup
- ✅ C2: Dashboard
- ✅ C3: Workspace Home (with announcements panel)
- ✅ C4: Chat (with resizable panel, soft cards)
- ✅ C5: Notes List
- ✅ C6: Meetings List (with recurrence UI + ↻ badge)
- ✅ C7: Files
- ✅ C8: Members, Groups, Billing, Audit Log
- ✅ C9: Meeting Hub (CRITICAL FIX applied: chat URL, design tokens, MeetingNotesSection restyled)
- ❌ C10: Video Room (still needs redesign)
- ❌ C11: Landing Page (still needs real screenshots + sections)

### Screenshot assets (for C11)
- `public/screen.png` — text editor screenshot (use as hero for notes feature)
- `public/Screenshot 2026-05-17 at 1.11.45 PM.png` — whiteboard screenshot (use as hero for whiteboard feature)

---

## ⚡ PRIORITY 1: Billing Overhaul — Do This Before Any Frontend Work

Frontend changes are paused. The entire billing system — pricing model, feature gates, storage logic, Stripe products, and webhook handling — must be rebuilt first. This section is the complete implementation plan. Work through it in order.

---

### Final Pricing Model (DECIDED — do not re-litigate)

| Tier | Price | Members | Shared storage | Private/user | Recordings | Other |
|---|---|---|---|---|---|---|
| **Free** | $0 | 3 max | 500 MB | 200 MB | None | No whiteboard, no groups |
| **Pro** | $25 CAD/workspace/mo | 20 incl. · +$1 CAD/member/mo | 10 GB | 2 GB | 5 hrs/mo · +$1.50 CAD/hr | Groups, whiteboard |
| **Institution** | $65 CAD/workspace/mo | 50 incl. · +$0.50 CAD/member/mo | 50 GB | 5 GB | 20 hrs/mo · +$1.50 CAD/hr | Groups, whiteboard, audit log, priority support |
| **Enterprise** | $250+ CAD/workspace/mo · annual contract | Custom | Custom | Custom | Custom | All Institution features + SLA + dedicated support |

**Key rule:** Whiteboard (tldraw) is Pro+ only. Free tier gets text notes only.
**Overage billing:** Member and recording overages are calculated on `invoice.created` webhook and added as line items before the invoice finalizes.
**Enterprise:** Custom-invoiced via Stripe. Does not use the checkout flow. OWNER contacts sales → Dhyan creates a manual subscription in Stripe dashboard.

**Fixed cost reminder (affects margin):**
- tldraw: $500/mo · Supabase Pro: $25/mo · Liveblocks Pro: $99/mo · Resend: $20/mo · Hosting: $41/mo = **$685/mo total**
- **Email tldraw at sales@tldraw.com for startup pricing on deployment day** — 80% discount drops fixed costs to ~$185/mo

---

### Step 1 — Schema migration

Create file: `prisma/migrations/20260518000000_billing_overhaul/migration.sql`

```sql
-- Add ENTERPRISE to SubscriptionPlan enum
ALTER TYPE "SubscriptionPlan" ADD VALUE 'ENTERPRISE';

-- Add recording duration tracking to MeetingRecording
-- Used for calculating monthly recording hours per workspace
ALTER TABLE "MeetingRecording" ADD COLUMN "durationSeconds" INTEGER;
```

Update `prisma/schema.prisma`:
```prisma
enum SubscriptionPlan {
  FREE
  PRO
  INSTITUTION
  ENTERPRISE    -- add this
}
```

Add to `MeetingRecording` model:
```prisma
durationSeconds  Int?
```

When a recording completes (in the recording completion webhook or `lib/meeting-recording.ts`), calculate and store `durationSeconds = completedAt - startedAt` in seconds. This is what the overage billing uses.

**Run after schema changes:**
```bash
npx prisma migrate deploy
npx prisma generate
lsof -ti:3000 | xargs kill -9 && npm run dev
```

---

### Step 2 — Rewrite `lib/billing.ts`

Replace the entire file. All constants, all helpers. Here is the complete spec:

**Constants:**
```ts
// ── Workspace limits ──────────────────────────────────────────────────────────
export const FREE_WORKSPACE_LIMIT = 1            // was 3
export const FREE_MEMBER_LIMIT    = 3            // was 5

// ── Pro limits ────────────────────────────────────────────────────────────────
export const PRO_MEMBER_LIMIT              = 20           // included members
export const PRO_MEMBER_OVERAGE_CAD        = 1.00         // per member/month beyond 20
export const PRO_RECORDING_HOURS           = 5            // included hrs/month
export const PRO_RECORDING_OVERAGE_CAD     = 1.50         // per hr beyond 5

// ── Institution limits ────────────────────────────────────────────────────────
export const INSTITUTION_MEMBER_LIMIT             = 50
export const INSTITUTION_MEMBER_OVERAGE_CAD       = 0.50
export const INSTITUTION_RECORDING_HOURS          = 20
export const INSTITUTION_RECORDING_OVERAGE_CAD    = 1.50

// ── Shared storage limits (WORKSPACE_SHARED files only) ───────────────────────
export const FREE_SHARED_STORAGE_BYTES        = 500  * 1024 * 1024          //  500 MB
export const PRO_SHARED_STORAGE_BYTES         = 10   * 1024 * 1024 * 1024   //   10 GB
export const INSTITUTION_SHARED_STORAGE_BYTES = 50   * 1024 * 1024 * 1024   //   50 GB
export const ENTERPRISE_SHARED_STORAGE_BYTES  = 200  * 1024 * 1024 * 1024   //  200 GB (default, negotiable)

// ── Private storage limits (per user, PRIVATE files) ─────────────────────────
export const FREE_PRIVATE_STORAGE_BYTES_PER_USER        = 200 * 1024 * 1024         //  200 MB
export const PRO_PRIVATE_STORAGE_BYTES_PER_USER         = 2   * 1024 * 1024 * 1024  //    2 GB
export const INSTITUTION_PRIVATE_STORAGE_BYTES_PER_USER = 5   * 1024 * 1024 * 1024  //    5 GB
export const ENTERPRISE_PRIVATE_STORAGE_BYTES_PER_USER  = 10  * 1024 * 1024 * 1024  //   10 GB
```

**New helper functions to add:**
```ts
// Returns shared storage limit for the workspace plan
export function getSharedStorageLimitBytes(plan: SubscriptionPlan): number

// Returns private storage limit per user for the plan
export function getPrivateStorageLimitPerUserBytes(plan: SubscriptionPlan): number

// Sums ONLY WORKSPACE_SHARED files — used for workspace storage gating
export async function getWorkspaceSharedStorageBytes(workspaceId: string): Promise<number>

// Sums ONLY PRIVATE files for a specific user in a workspace
export async function getUserPrivateStorageBytes(userId: string, workspaceId: string): Promise<number>

// Total recording seconds used in the current billing period
// billingPeriodStart: start of current Stripe billing period (pass from subscription)
export async function getWorkspaceRecordingSecondsThisPeriod(
  workspaceId: string,
  billingPeriodStart: Date
): Promise<number>

// Included member count for the plan
export function getIncludedMemberLimit(plan: SubscriptionPlan): number

// Included recording hours for the plan
export function getIncludedRecordingHours(plan: SubscriptionPlan): number

// Per-member overage rate in CAD for the plan (0 if not applicable)
export function getMemberOverageRateCad(plan: SubscriptionPlan): number

// Per-recording-hour overage rate in CAD (0 if not applicable)
export function getRecordingOverageRateCad(plan: SubscriptionPlan): number
```

**Remove:** `getWorkspaceStorageBytes` (replace all callers with `getWorkspaceSharedStorageBytes`)
**Keep:** `getWorkspacePlan`, `getWorkspaceActiveMemberCount`, `getOwnedWorkspaceCount`, `userHasPaidWorkspace`, `syncWorkspacePlanFromStripe`, `getStorageLimitBytes` (keep as alias calling `getSharedStorageLimitBytes` for backward compat)

---

### Step 3 — Fix storage split in `app/workspaces/[id]/files/actions.ts`

Currently `uploadWorkspaceFile` (line ~75) calls `getWorkspaceStorageBytes` which counts ALL files. Fix:

```ts
// In uploadWorkspaceFile, replace the storage check block:
const visibility = String(formData.get("visibility") ?? "WORKSPACE_SHARED");

if (visibility === "WORKSPACE_SHARED") {
  // Check workspace shared storage quota
  const [currentSharedStorage, sharedLimit] = await Promise.all([
    getWorkspaceSharedStorageBytes(workspace.id),
    Promise.resolve(getSharedStorageLimitBytes(workspace.plan)),
  ]);
  if (currentSharedStorage + uploadedFile.size > sharedLimit) {
    redirect(`/workspaces/${workspaceId}/files?file=storage-limit`);
  }
} else {
  // Check per-user private storage quota
  const [currentPrivateStorage, privateLimit] = await Promise.all([
    getUserPrivateStorageBytes(currentUser.id, workspace.id),
    Promise.resolve(getPrivateStorageLimitPerUserBytes(workspace.plan)),
  ]);
  if (currentPrivateStorage + uploadedFile.size > privateLimit) {
    redirect(`/workspaces/${workspaceId}/files?file=private-storage-limit`);
  }
}
```

Also update the storage limit display in `app/workspaces/[id]/files/page.tsx` and `app/workspaces/[id]/billing/page.tsx` to call `getWorkspaceSharedStorageBytes` instead of `getWorkspaceStorageBytes`.

---

### Step 4 — Feature gating changes

**4a. Whiteboard gating — gate to Pro+, Free gets text notes only**

Files to update:

`app/workspaces/[id]/notes/page.tsx`:
- The "New Whiteboard" button and the "More" dropdown whiteboard options should be hidden/disabled when `workspace.plan === "FREE"`
- Show an upgrade prompt instead: "Upgrade to Pro to create whiteboards"
- Pass `canUseWhiteboard = workspace.plan !== "FREE"` and conditionally render

`app/workspaces/[id]/notes/actions.ts` — `createWhiteboardNote`:
- Add plan check at start of action:
  ```ts
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } })
  if (workspace?.plan === "FREE") {
    redirect(`/workspaces/${workspaceId}/notes?note=plan-upgrade-required`)
  }
  ```

`components/MeetingNotesSection.tsx`:
- The "New Board" button in `NoteHeader` should check workspace plan
- Pass `canUseWhiteboard` prop down from the server-side meeting hub page

`app/workspaces/[id]/notes/[noteId]/page.tsx`:
- If a whiteboard note is opened on a Free workspace (edge case — grandfathered), show an upgrade banner at the top

**4b. Member limit changes**

`lib/billing.ts`:
- `FREE_MEMBER_LIMIT = 3` (was 5) — already in Step 2

`app/workspaces/[id]/members/page.tsx` and `app/workspaces/[id]/actions.ts` — `addWorkspaceMember`:
- Currently checks `memberCount >= FREE_MEMBER_LIMIT`
- Update to check the correct limit per plan:
  ```ts
  const limit = workspace.plan === "FREE"
    ? FREE_MEMBER_LIMIT  // 3
    : null               // Pro/Institution: no hard cap, overages billed
  if (limit && memberCount >= limit) {
    redirect(`/workspaces/${workspaceId}/members?invite=plan-limit`)
  }
  ```
- For Pro and Institution: no hard member cap — overages are billed via Stripe. Members can always be invited; billing catches up at next invoice.

**4c. Workspace creation limit**

`FREE_WORKSPACE_LIMIT = 1` (was 3). Update wherever workspace creation is gated.

`app/(app)/actions.ts` or wherever `createWorkspace` is — find the `getOwnedWorkspaceCount` check and update to use the new constant.

Update all UI copy: "Free plan allows 1 workspace" (was 3).

---

### Step 5 — Recording hour tracking and enforcement

**5a. Store duration on recording completion**

In `lib/meeting-recording.ts` — find the function that handles recording completion (called from the LiveKit Egress webhook or the recording complete route). When status transitions to COMPLETED:

```ts
// Calculate and store duration
const recording = await prisma.meetingRecording.findUnique({ where: { id }, select: { startedAt: true, stoppedAt: true } })
if (recording?.startedAt && recording?.stoppedAt) {
  const durationSeconds = Math.round(
    (recording.stoppedAt.getTime() - recording.startedAt.getTime()) / 1000
  )
  await prisma.meetingRecording.update({ where: { id }, data: { durationSeconds } })
}
```

**5b. Enforce recording hour limit before starting**

In the recording start action (wherever `startRoomRecording` is called, in `app/workspaces/[id]/meetings/[meetingId]/actions.ts` or similar):

```ts
// Get current billing period start from Stripe subscription
const subscription = await prisma.subscription.findUnique({
  where: { workspaceId },
  select: { currentPeriodStart: true, plan: true }
})

if (subscription) {
  const usedSeconds = await getWorkspaceRecordingSecondsThisPeriod(workspaceId, subscription.currentPeriodStart)
  const includedHours = getIncludedRecordingHours(subscription.plan)
  const usedHours = usedSeconds / 3600

  // Allow up to 2x the included hours before hard-blocking (overages are billed)
  // Hard block at 3x to prevent runaway costs on a single workspace
  if (usedHours >= includedHours * 3) {
    redirect(`/workspaces/${workspaceId}/meetings/${meetingId}/video?recording=hard-limit`)
  }
}
```

The Stripe overage billing (Step 7) handles charging for overages up to the 3x soft limit.

---

### Step 6 — Stripe dashboard setup (do this manually)

**⚠️ Do in TEST mode first, verify everything works, then repeat in LIVE mode before deployment.**

**Products to create:**

**Product 1: Scribbl Pro**
- Name: `Scribbl Pro`
- Create price: `$25.00 CAD`, recurring monthly
- Save price ID as `STRIPE_PRICE_PRO_BASE_CAD` in `.env`

**Product 2: Scribbl Institution**
- Name: `Scribbl Institution`
- Create price: `$65.00 CAD`, recurring monthly
- Save price ID as `STRIPE_PRICE_INSTITUTION_BASE_CAD` in `.env`

**Product 3: Member Overage — Pro**
- Name: `Pro Member Overage`
- Create price: `$1.00 CAD`, one-time (used for invoice items, not subscriptions)
- Save price ID as `STRIPE_PRICE_PRO_MEMBER_OVERAGE_CAD` in `.env`

**Product 4: Member Overage — Institution**
- Name: `Institution Member Overage`
- Create price: `$0.50 CAD`, one-time
- Save as `STRIPE_PRICE_INSTITUTION_MEMBER_OVERAGE_CAD` in `.env`

**Product 5: Recording Overage**
- Name: `Recording Hour Overage`
- Create price: `$1.50 CAD`, one-time
- Save as `STRIPE_PRICE_RECORDING_OVERAGE_CAD` in `.env`

**Webhook events to enable** (on the Stripe webhook endpoint `/api/stripe/webhook`):
- `checkout.session.completed` — already handled
- `customer.subscription.updated` — already handled
- `customer.subscription.deleted` — already handled
- `invoice.payment_failed` — already handled
- `invoice.created` ← **ADD THIS** — needed for overage billing
- `invoice.finalized` — optional, useful for logging

**Add new env vars to `.env` and `.env.example`:**
```
STRIPE_PRICE_PRO_BASE_CAD=price_...
STRIPE_PRICE_INSTITUTION_BASE_CAD=price_...
STRIPE_PRICE_PRO_MEMBER_OVERAGE_CAD=price_...
STRIPE_PRICE_INSTITUTION_MEMBER_OVERAGE_CAD=price_...
STRIPE_PRICE_RECORDING_OVERAGE_CAD=price_...
```

---

### Step 7 — Update `app/workspaces/[id]/billing/billing-actions.ts` and webhook

**7a. Update `upgradeWorkspaceToPro` → rename to `upgradeWorkspaceToPlan`**

Current function hardcodes the Pro price ID. Replace with a plan-aware version:

```ts
export async function upgradeWorkspaceToPlan(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "")
  const targetPlan = String(formData.get("plan") ?? "PRO") // "PRO" or "INSTITUTION"

  // ... existing auth checks ...

  const priceId = targetPlan === "INSTITUTION"
    ? process.env.STRIPE_PRICE_INSTITUTION_BASE_CAD!
    : process.env.STRIPE_PRICE_PRO_BASE_CAD!

  // Create Stripe checkout session with the correct price ID
  // Re-enable automatic_tax: { enabled: true } when Stripe business verification is complete
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // ... rest of existing checkout session config ...
  })

  redirect(session.url!)
}
```

Update `app/workspaces/[id]/billing/page.tsx` to render both "Upgrade to Pro" and "Upgrade to Institution" buttons, each passing the correct `plan` hidden input.

**7b. Add `invoice.created` handler to webhook**

In `app/api/stripe/webhook/route.ts`, add a new case in the switch statement:

```ts
case "invoice.created": {
  const invoice = event.data.object as Stripe.Invoice
  await handleInvoiceCreated(invoice)
  break
}
```

Create `lib/stripe-overage.ts`:

```ts
export async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  // Only process subscription invoices (not one-off)
  if (!invoice.subscription) return

  // Get the subscription to find which workspace this is for
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
  const workspaceId = subscription.metadata?.workspaceId
  if (!workspaceId) return

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, plan: true },
  })
  if (!workspace || workspace.plan === "FREE") return

  // ── Member overage ────────────────────────────────────────────────────────
  const memberCount = await getWorkspaceActiveMemberCount(workspaceId)
  const includedMembers = getIncludedMemberLimit(workspace.plan)
  const extraMembers = Math.max(0, memberCount - includedMembers)

  if (extraMembers > 0) {
    const memberOveragePriceId = workspace.plan === "INSTITUTION"
      ? process.env.STRIPE_PRICE_INSTITUTION_MEMBER_OVERAGE_CAD!
      : process.env.STRIPE_PRICE_PRO_MEMBER_OVERAGE_CAD!

    await stripe.invoiceItems.create({
      customer: invoice.customer as string,
      invoice: invoice.id,
      price: memberOveragePriceId,
      quantity: extraMembers,
      description: `${extraMembers} extra member${extraMembers > 1 ? "s" : ""} beyond ${includedMembers} included`,
    })
  }

  // ── Recording overage ─────────────────────────────────────────────────────
  const billingPeriodStart = new Date(subscription.current_period_start * 1000)
  const recordingSeconds = await getWorkspaceRecordingSecondsThisPeriod(workspaceId, billingPeriodStart)
  const usedHours = recordingSeconds / 3600
  const includedHours = getIncludedRecordingHours(workspace.plan)
  const extraHours = Math.max(0, Math.ceil(usedHours - includedHours)) // round up to nearest hour

  if (extraHours > 0) {
    await stripe.invoiceItems.create({
      customer: invoice.customer as string,
      invoice: invoice.id,
      price: process.env.STRIPE_PRICE_RECORDING_OVERAGE_CAD!,
      quantity: extraHours,
      description: `${extraHours} recording hour${extraHours > 1 ? "s" : ""} beyond ${includedHours} included`,
    })
  }

  // Write audit log for the overage charge
  if (extraMembers > 0 || extraHours > 0) {
    await writeAuditLog({
      action: "BILLING_OVERAGE_CHARGED",
      workspaceId,
      metadata: { extraMembers, extraHours, invoiceId: invoice.id },
    })
  }
}
```

**Note:** `BILLING_OVERAGE_CHARGED` is a new AuditAction enum value. Add it to `prisma/schema.prisma` enum and create a migration for it:
```sql
ALTER TYPE "AuditAction" ADD VALUE 'BILLING_OVERAGE_CHARGED';
```
Add this to the existing billing migration (Step 1) or create a separate one.

**7c. Update `syncWorkspacePlanFromStripe`**

The existing function handles PRO and cancellations. Update to also handle INSTITUTION:
- Map Stripe product IDs to plan names
- Add INSTITUTION and ENTERPRISE cases

---

### Step 8 — Frontend: billing page, pricing page, and gated UI

**8a. Billing page** — `app/workspaces/[id]/billing/page.tsx`

The billing page needs a full redesign matching the mockup (see Group 7, item 17 in the original MVP list below). Key changes from the original spec now that billing is richer:

- **Active plan card:** Show plan name, base price, billing date, storage meter split into two bars (Shared storage: X GB / Y GB · Your private storage: X GB / Y GB), member meter (X members / Y included · Z on overage), recording hours meter (X hrs / Y hrs this period)
- **Overage preview:** If currently overusing, show a projected overage amount: "Estimated overage this cycle: $12.50 CAD"
- **Payment method card:** Fetch from Stripe `stripe.customers.listPaymentMethods(customerId, { type: 'card' })` — show card last 4 + expiry + brand. "Edit Details" → Stripe Customer Portal.
- **Explore Plans section:** All 4 tiers side by side (Free / Pro / Institution / Enterprise). Active plan highlighted. Show upgrade button for higher tiers, "Contact sales" for Enterprise.
- **Billing history table:** `stripe.invoices.list({ customer: customerId, limit: 10 })` — Date, Amount, Status (PAID/FAILED/PENDING badge), PDF link.
- **Refresh billing status button:** Keep existing `refreshBillingStatus` action.

**8b. Pricing page** — `app/pricing/page.tsx` (or wherever the landing page pricing section is)

Update to show all 4 tiers with correct features/prices/limits. Match the final pricing table above exactly.

**8c. Notes pages — whiteboard gate**

`app/workspaces/[id]/notes/page.tsx` — the `canUseWhiteboard` prop pattern (see Step 4a above).

**8d. Members page — correct limit messaging**

`app/workspaces/[id]/members/page.tsx` — update the "plan-limit" upgrade message from "5 members" to "3 members on Free". For Pro/Institution workspaces, show the member overage info instead of a hard limit message.

---

### Step 9 — Verify and test

After all steps are complete, test each of these flows:

1. **Free workspace:** Create note → whiteboard button hidden ✓. Invite 4th member → blocked ✓. Upload file until 500MB → blocked ✓. Create 2nd workspace → blocked ✓.
2. **Pro workspace checkout:** Click "Upgrade to Pro" → Stripe checkout at $25 CAD ✓. Webhook fires → plan updates to PRO ✓. Whiteboard unlocked ✓. Recording available ✓.
3. **Institution workspace checkout:** Click "Upgrade to Institution" → checkout at $65 CAD ✓. Plan updates to INSTITUTION ✓. Audit log accessible ✓.
4. **Member overage:** On a Pro workspace with 25 members (5 over), simulate `invoice.created` webhook → invoice should have a $5 CAD line item for 5 extra members ✓.
5. **Recording overage:** After 6 hours of recording on Pro (1 over limit), simulate invoice → $1.50 CAD line item for 1 extra hour ✓.
6. **Storage split:** Upload WORKSPACE_SHARED file → counts against workspace shared quota ✓. Upload PRIVATE file → counts against user private quota, not workspace ✓.
7. **Enterprise:** Cannot checkout through normal flow. Billing page shows "Contact sales" → mailto link ✓.

---

## ⏸️ PAUSED — Frontend MVP Items

The following items are paused until the billing overhaul (Priority 1 above) is complete. Do not start these until Steps 1–9 above are done and verified.

## MVP Todo List (34 items — resume after billing overhaul)

Work through these in order. Items 1–3 need no schema changes. Items that need schema changes are noted — batch all schema changes and run migrate/generate once.

### Group 1: Landing page (no schema changes)

**1. C11 Landing page** — `components/LandingPage.tsx`
- Use `public/screen.png` as the text editor hero image (TipTap editor screenshot)
- Use `public/Screenshot 2026-05-17 at 1.11.45 PM.png` as the whiteboard hero image
- Use `<Image>` tags with proper `next/image` imports
- Sections: Hero (headline + sub + CTA buttons "Start free" → /login, "View pricing" → /pricing), session-hub hero overlay, Before/After workflow section, Features (with real screenshots), How it works, generic comparison with unnamed video-only/whiteboard-only tools, About, Meet the Team, Pricing, Feedback widget, Coming Soon, CTA + footer
- Positioning should be general-purpose: teams, projects, companies, departments, labs, classes, and communities. Do not make the landing page feel education-only.
- Meet the Team can use placeholder photo blocks until real names/photos are ready. Mention that Scribbl is built by four graduate and undergraduate students.

**2. Feedback/review widget** — add to `components/LandingPage.tsx`
- Simple form: textarea "What would you like to see?" + email field + submit
- Server action that sends to `hello@scribblapp.ca` via Resend (same pattern as meeting emails)
- Before launch: create an ImprovMX forwarding alias for `hello@scribblapp.ca` to the real inbox, or change the feedback recipient to an inbox that already works.
- Show "Thank you" message on submit
- Style as a section: "Shape what comes next — tell us what you want"

**3. "Coming in next release" section** — add to `components/LandingPage.tsx`
- Feature cards for: AI meeting summaries, AI note assistant, Version history, Wiki-style note linking, Workspace analytics, Mobile app, Message threading, @mentions, Direct messages, Meeting templates
- Style as a grid of pill badges or feature cards
- CTA: Link to the feedback widget with copy like "Tell us what to prioritize". Do not mention a waitlist until one exists.

### Group 2: Dashboard & navigation (no schema changes) — DONE

**4. Cap activity feed** — `app/page.tsx` — DONE
- Change `getWorkspaceActivity(workspaceIds, 15)` → `getWorkspaceActivity(workspaceIds, 8)`
- Add "View all →" link to a future `/activity` page for now — can link to `/` as placeholder

**5. Quick-action strip** — `app/page.tsx` — DONE
- Add a row of icon+label buttons below the workspace grid and above the 2-col section
- Actions: "New Note" (→ `/new/note`), "Continue" (→ newest activity item, or notifications fallback), "Upload File" (→ `/new/file`). The header already has the primary "New Session" action.
- Style as horizontal pill row: `flex gap-3`, each is `rounded-full border bg-surface px-4 py-2 font-semibold text-sm`
- Follow-up implementation note: dashboard actions are generalized because they live outside a workspace. Workspace-specific actions route to picker pages first.
- Latest implementation note: replaced redundant "Open Calendar" quick action with "Continue", which links to the newest activity item when available. Add invite notifications to MVP backlog: if an invited email already belongs to a user, create a `WORKSPACE_INVITE`-style in-app notification linking to `/invites/[token]`; keep dashboard invite cards as fallback for not-yet-registered users.

**6. AppSidebar improvements** — `components/AppSidebar.tsx` — DONE
- Added "Today" widget: links to the global day calendar and counts visible sessions across the user's workspaces.
- Added "Up next" widget: queries the next upcoming visible meeting across all user workspaces and links directly to it.
- Removed the redundant "Recent" workspace row.
- Added workspace-separated storage snapshot: each visible row links to that workspace's files page and shows its own usage/limit instead of one combined total.
- Responsive note: `AppSidebar` now renders desktop sidebar at `lg` and mobile top/bottom navigation below `lg`; dashboard and global app layout use responsive padding so content is not pushed off-screen on phones/tablets.

### Group 3: Text editor redesign (no schema changes needed beyond what's in Prisma)

**7. Text editor top bar** — `app/workspaces/[id]/notes/[noteId]/page.tsx` + `components/TextNoteEditor.tsx`
- The note page renders `<NoteEditorShell>` which renders `<TextNoteEditor>`. The top bar goes inside `TextNoteEditor` or in `NoteEditorShell`.
- Read the current `NoteEditorShell` in `app/workspaces/[id]/notes/[noteId]/page.tsx` — it has an expand/collapse shell
- Top bar contents:
  - Left: note title (editable inline — `contenteditable` or controlled input that calls `updateNoteTitle` action), autosave status pill ("Saved" or "Saving..." based on TipTap's `isSyncing` state)
  - Center: Liveblocks presence avatars (already in `lib/tiptap/liveblocks-cursors.ts` — render the `others` array from `useOthers()`) — each avatar is a colored circle with initials/avatar image
  - Right: "Export PDF" button (`<a href="/api/notes/[id]/export">`) + "Share" button (for now, copy link to clipboard)
- Style: `h-12 border-b bg-surface flex items-center justify-between px-5`

**8. Text editor toolbar restyle** — `components/NoteToolbar.tsx`
- Currently uses old green colors and `rounded-md` buttons
- Update to design tokens: `rounded-full` toolbar buttons, `--color-secondary` for active state, `--color-border` for dividers
- The toolbar renders inside `TextNoteEditor` — find the toolbar component and replace color classes
- Match the screenshot: clean flat toolbar, Paragraph/heading dropdown, font size, B/I/U, text color, alignment, lists, indent

**9. Text editor bottom bar** — `components/TextNoteEditor.tsx` or `app/workspaces/[id]/notes/[noteId]/page.tsx`
- Add a fixed bottom bar below the editor: `h-10 border-t bg-surface flex items-center px-5 gap-4 text-xs font-mono text-muted`
- Contents: "All changes saved" status (based on Yjs sync state) · word count (count spaces in editor text) · character count · zoom level (static "100%" for now — or implement with CSS transform) · "Save Draft" button (no-op for now, just visual)
- Word count: get from TipTap's `editor.getText().split(/\s+/).filter(Boolean).length`

### Group 4: Whiteboard redesign (no schema changes)

**10. Whiteboard top bar** — `components/TldrawWhiteboardEditor.tsx` + `app/workspaces/[id]/notes/[noteId]/page.tsx`
- Same pattern as text editor top bar: title (editable), autosave pill, Liveblocks presence avatars, Share button
- tldraw has its own header — check if it can be replaced. Currently `TldrawWhiteboardEditor` renders `<Tldraw>` with a custom toolbar override. Add a top bar ABOVE the tldraw canvas.
- The whiteboard page renders via `NoteEditorShell` → `TldrawWhiteboardEditor`

**11. Whiteboard bottom toolbar** — `components/TldrawWhiteboardEditor.tsx`
- tldraw v3 allows custom toolbar via the `components` prop: `<Tldraw components={{ Toolbar: CustomToolbar }}`
- The screenshot shows a floating pill toolbar at the bottom center with: select, hand, pencil, shapes, emoji, chat, export icons
- Current custom toolbar is in `components/TldrawWhiteboardEditor.tsx` — find it and restyle as floating pill
- Style: `fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-1 rounded-full border bg-surface shadow-lg px-3 py-2`

**12. Whiteboard right panel** — `components/TldrawWhiteboardEditor.tsx`
- tldraw's native right panel (StylePanel) renders automatically
- To restyle it, override via `components={{ StylePanel: CustomStylePanel }}` or use CSS targeting `.tl-style-panel`
- Update colors to design tokens — replace any hardcoded colors tldraw renders with CSS overrides in globals.css targeting `.tl-*` class names

### Group 5: Note editor slash commands (no schema changes)

**13. Slash commands** — `components/TextNoteEditor.tsx`
- TipTap v3 supports slash commands via the `@tiptap/suggestion` package (already in project as TipTap dependency)
- Install: `npm install @tiptap/suggestion` (may already be present as transitive dep)
- Create `lib/tiptap/slash-commands.ts` — defines the command list and renders a dropdown
- Commands: Heading 1, Heading 2, Heading 3, Bullet list, Numbered list, Code block, Math block (KaTeX), Table, Divider, Quote
- Trigger: `/` key → dropdown of commands → Enter or click to insert
- Render the dropdown as a floating div positioned below the cursor (use TipTap's suggestion tippy.js or a custom render function)
- Add the extension to `TextNoteEditor`'s extension array

### Group 6: Video room redesign (no schema changes)

**14. Video room C10** — `app/workspaces/[id]/meetings/[meetingId]/video/`
Files: `page.tsx`, `MeetingVideoRoom.tsx`, `VideoPopoutShell.tsx`, `FloatingMeetingVideo.tsx`
- Dark theme: `bg-[var(--color-live)]` (#131b2e) as base background
- Update accent colors from green → blue (`--color-secondary`)
- Controls bar (`ConferenceSurface.tsx` + `RecordingControls.tsx`): restyle as floating pill bar at bottom, matching the design system
- Add speaker spotlight vs gallery view toggle: a `viewMode` state (`"gallery" | "spotlight"`), speaker spotlight = large primary video + small secondary tiles, gallery = equal grid
- Keep ALL LiveKit/Liveblocks hooks intact — only touch className strings and layout wrappers
- `canRecord` prop chain MUST be preserved: `page.tsx → FloatingMeetingVideo → VideoPopoutShell → MeetingVideoRoom → ConferenceSurface → RecordingControls`

### Group 7: Account & billing pages (needs schema migration)

**15. User schema extension** — `prisma/schema.prisma` + new migration
- Add to `User` model:
  ```
  institution  String?
  jobTitle     String?
  timezone     String?  @default("UTC")
  language     String?  @default("en")
  bio          String?
  darkMode     Boolean  @default(false)
  ```
- Create migration: `prisma/migrations/20260518000000_extend_user_profile/migration.sql`
  ```sql
  ALTER TABLE "User" ADD COLUMN "institution" TEXT;
  ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
  ALTER TABLE "User" ADD COLUMN "timezone" TEXT DEFAULT 'UTC';
  ALTER TABLE "User" ADD COLUMN "language" TEXT DEFAULT 'en';
  ALTER TABLE "User" ADD COLUMN "bio" TEXT;
  ALTER TABLE "User" ADD COLUMN "darkMode" BOOLEAN NOT NULL DEFAULT false;
  ```
- Run: `npx prisma migrate deploy && npx prisma generate`, restart dev server

**16. Account page redesign** — `app/account/page.tsx`
- Read the current page to see existing fields
- Match the mockup: profile photo (existing avatar upload, keep `<form>` with server action), display name, email (read-only)
- Add new fields: institution (text input), jobTitle (dropdown: Student, TA/Researcher, Professor, Engineer, Manager, Other), bio (textarea)
- Notification toggles (existing — restyle as iOS-style toggle switches with `<input type="checkbox">` styled with Tailwind)
- Region & Time: timezone dropdown (list of common timezones), language dropdown (en, fr, es, etc.)
- "Support Center" card (dark background): link to `/help` page
- Layout: 2-col on desktop (main form left, notifications + region right), 1-col on mobile
- All using `updateProfile` server action in `app/account/actions.ts` (extend to handle new fields)

**17. Billing page redesign** — `app/workspaces/[id]/billing/page.tsx`
- Match the mockup screenshot:
  - Active plan card: "ACTIVE PLAN" badge (pill), plan name ("Pro" / "Free" / "Institution"), billing date, storage meter bar, "Manage Subscription" + "Cancel Plan" buttons
  - Payment Method card: last 4 digits + expiry — fetch from Stripe: `stripe.customers.listPaymentMethods(customerId, { type: 'card' })`; display masked card number + brand icon. "Edit Details" → Stripe Customer Portal
  - "Explore Plans" section: Free card + Pro card side by side. Pro card has "MOST POPULAR" badge (top-right). Each shows price, feature list with ✓/✗ icons, CTA button
  - Billing History table: fetch from Stripe `stripe.invoices.list({ customer: customerId, limit: 10 })` — show date, amount_paid, status (PAID/FAILED badge), PDF download link (`invoice.invoice_pdf`)
  - Style: `rounded-2xl` cards, design tokens throughout

### Group 8: Dark/light mode (needs schema field from item 15)

**18. Light/dark mode** — multi-file change
- CSS: Add a `[data-theme="dark"]` override block in `app/globals.css` that redefines all `--color-*` tokens to dark values. Example dark tokens:
  ```css
  [data-theme="dark"] {
    --color-bg: #0f0f13;
    --color-surface: #1a1b20;
    --color-surface-low: #222330;
    --color-surface-mid: #2a2b38;
    --color-surface-high: #32333f;
    --color-text: #e8e8f0;
    --color-muted: #a0a0b0;
    --color-subtle: #6b6b7a;
    --color-border: #2e2e3d;
    --color-border-strong: #3d3d50;
  }
  ```
- Create `components/ThemeToggle.tsx` — "use client" component. On mount: reads `localStorage.getItem('theme')` or user's `darkMode` DB preference. Sets `document.documentElement.dataset.theme = 'dark'` or `'light'`. Renders a sun/moon toggle button.
- Add `ThemeToggle` to both `AppSidebar` and `WorkspaceSidebar` (bottom, near user info)
- Persist to DB: call a `updateThemePreference(darkMode: boolean)` server action that updates `User.darkMode`
- On page load: `app/layout.tsx` fetches user's `darkMode` preference and sets `data-theme` on `<html>` to avoid flash

### Group 8.5: Organization pricing model (research + product decision, no schema changes until decided)

**18A. Organization pricing/cost model deep dive**
- Current public Organization price idea: `$299 CAD / organization / month`, not per workspace.
- Need a detailed cost and margin model before finalizing public copy or billing implementation.
- Analyze all variable cost drivers, not only Supabase:
  - Supabase database/storage/bandwidth/egress, backups, custom domain, PITR if enabled
  - LiveKit video minutes, participant minutes, Egress/recording costs, recording storage transfer
  - Liveblocks seats/concurrent collaboration usage/rooms if applicable
  - Resend email volume
  - Stripe fees, failed payments, currency conversion, tax handling
  - File uploads/downloads, recordings, PDF exports, Playwright runtime hosting costs
  - Hosting/runtime costs (Railway/Fly/etc.), background jobs, logs/monitoring
  - Support/admin burden for org customers
- Decide Organization storage policy:
  - Included pooled org storage, e.g. `100 GB included`
  - Additional storage rate, e.g. `$0.15 CAD / GB / month` or storage packs
  - Whether to expose bandwidth/download overages publicly or keep as fair-use/custom plan language
  - Private file policy: private files should have per-member quotas and still be represented in org/admin storage reporting without exposing private contents
- Produce a written pricing memo with:
  - Cost assumptions
  - Worst-case abuse scenarios
  - Gross margin estimates at low/medium/high usage
  - Recommended public pricing copy
  - Recommended internal alerts/limits before customers create surprise costs
- Do not implement paid Organization overage billing until this memo is reviewed.

### Group 9: Command palette (no schema changes)

**19. Command palette (⌘K)** — new `components/CommandPalette.tsx` + `app/layout.tsx`
- "use client" component
- Keyboard shortcut: `useEffect` listening for `(e.metaKey || e.ctrlKey) && e.key === 'k'` → open/close
- Modal overlay: `fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[20vh]`
- Search input at top of palette
- Sections: Recent (visited workspaces/notes), Workspaces, Notes, Meetings, Channels, Actions (New workspace, Schedule session, New note)
- Fuzzy search via `prisma.note.findMany({ where: { title: { contains: q } } })` etc. — but this needs to be a server action or API route since the component is client-side
- Create `/api/command-search?q=X` route that queries notes, meetings, workspaces, channels for the user
- Press Enter or click to navigate to result
- Add `<CommandPalette />` to `app/layout.tsx` so it's available on all pages

### Group 10: Global search (no schema changes)

**20. Global search** — `app/(app)/search/page.tsx` (new page)
- Server component, takes `?q=search+term` as URL param
- Sections: Notes (Prisma `title contains q` or `contentJson contains q`), Meetings (title, description), Files (name), Chat messages (body)
- Results grouped by type with icons
- Add search input to `AppSidebar` (above nav links) — `<form action="/search"><input name="q" /></form>`
- Or make a search icon in AppSidebar that expands to an input

### Group 11: Chat features (needs schema migrations — batch together)

**Schema changes for chat — create ONE migration for all:**
```sql
-- MessageReaction (item 21)
CREATE TABLE "MessageReaction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("messageId", "userId", "emoji")
);

-- Message attachments (item 22)
ALTER TABLE "Message" ADD COLUMN "attachmentFileId" UUID REFERENCES "File"("id") ON DELETE SET NULL;

-- Message threading (item 26)
ALTER TABLE "Message" ADD COLUMN "replyToId" UUID REFERENCES "Message"("id") ON DELETE SET NULL;

-- Message pinning (item 28)
ALTER TABLE "Message" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- Direct messages (item 30)
-- ChannelType enum: add DIRECT value
ALTER TYPE "ChannelType" ADD VALUE 'DIRECT';
```

Also update `prisma/schema.prisma` with:
```prisma
model MessageReaction {
  id        String   @id @default(uuid()) @db.Uuid
  messageId String   @db.Uuid
  userId    String   @db.Uuid
  emoji     String
  createdAt DateTime @default(now())
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([messageId, userId, emoji])
}
```
And add fields to `Message` model: `attachmentFileId`, `replyToId`, `isPinned`, `reactions MessageReaction[]`

**21. Message reactions** — after migration:
- API route: `app/api/chat/reactions/route.ts` — POST (add reaction) / DELETE (remove reaction)
- POST: `prisma.messageReaction.upsert(...)`, then broadcast via Liveblocks `{ type: "reaction-added", messageId, emoji, userId }`
- DELETE: `prisma.messageReaction.delete(...)`, then broadcast `{ type: "reaction-removed", messageId, emoji, userId }`
- UI in `RealtimeChatPanel.tsx`: on message hover, show a row of 6-8 emoji buttons (👍 ❤️ 😂 🔥 ✅ 🙏 😮 👀). Below each message, render reaction pills with count. Clicking toggles your reaction.
- Listen for reaction broadcasts in the existing event handler (same pattern as message-created/edited/deleted)

**22. File attachments** — after migration:
- API route: `app/api/chat/attachments/route.ts` — multipart POST, saves to Supabase Storage under `workspaces/{id}/chat-attachments/`, creates File record, returns `{ fileId, url, mimeType }`
- Respects workspace storage limit (call `getWorkspaceStorageBytes` + `getStorageLimitBytes`)
- UI: 📎 button in composer. On click: file input. On select: upload first, show preview. Send message with `attachmentFileId`.
- Message render: if `attachmentFileId`, show inline image (if `image/*`) or download card (other types)

**23. Code blocks** — no schema change needed:
- Install: `npm install shiki` (syntax highlighting)
- In `RealtimeChatPanel.tsx`: parse message body for ` ```lang\ncode\n``` ` blocks before rendering
- Create a `<CodeBlock language={lang} code={code} />` component that uses Shiki to render
- Since Shiki is async, use `react-server-components` pattern or pre-render on the server side
- Simpler approach: use `highlight.js` (sync) instead of Shiki for client-side rendering

**24. LaTeX math** — no schema change:
- KaTeX is already installed (used in TipTap notes)
- In `RealtimeChatPanel.tsx`: parse `$inline$` and `$$block$$` patterns in message body
- Render with `katex.renderToString(math, { displayMode: false/true })`
- Add `katex.min.css` import to the chat component

**25. Link unfurl previews** — no schema change:
- Create `app/api/unfurl/route.ts` — GET `?url=X`
- Fetch the URL server-side, parse `og:title`, `og:description`, `og:image`, `og:site_name` from HTML
- Return `{ title, description, image, siteName }` JSON
- In `RealtimeChatPanel.tsx`: detect URLs in message body (regex), call `/api/unfurl?url=X` on mount for each URL, show a card below the message if OG data found
- Cache in memory or in DB (optional) to avoid re-fetching

**26. Message threading** — after migration:
- UI: "Reply" button on message hover → sets `replyToId` state in composer
- Composer shows "Replying to [sender name]" banner with ✕ to clear
- Send message includes `replyToId`
- Thread panel: clicking "N replies" opens a right side panel showing the thread
- In `RealtimeChatPanel.tsx`: group messages that have `replyToId` together. Show "N replies" link on parent messages.

**27. @mentions** — no schema change:
- In composer: type `@` → dropdown of workspace members (fetch from workspace)
- On select: insert `@displayName` with special formatting (blue pill in composer)
- Store in message body as `@[userId:displayName]` format
- Render in message: replace `@[userId:displayName]` with styled `<span class="mention">@displayName</span>`
- Notification: when message sent, parse mentions, call `createWorkspaceNotifications` for each mentioned user

**28. Message pinning** — after migration:
- Server action: `pinMessage(messageId, workspaceId)` — sets `isPinned = true`, OWNER/ADMIN only
- UI: "Pin" option in message actions (... menu or on hover), only visible to OWNER/ADMIN
- Pinned messages section in the chat right panel (already has sections there)
- Query pinned messages: `prisma.message.findMany({ where: { channelId, isPinned: true } })`

**29. Search within channel** — no schema change:
- API route: `app/api/chat/search/route.ts` — GET `?channelId=X&q=Y`
- `prisma.message.findMany({ where: { channelId, body: { contains: q, mode: 'insensitive' }, deletedAt: null } })`
- UI: search icon in channel header → input field expands → results dropdown with message excerpts → click to scroll to message

**30. Direct messages** — after migration (ChannelType.DIRECT):
- Server action: `findOrCreateDmChannel(workspaceId, targetUserId)` in `app/workspaces/[id]/chat/actions.ts`
  - `prisma.channel.findFirst({ where: { workspaceId, type: 'DIRECT', AND: [{ meetingId: null }] } })` — check existing DM
  - If not found: `prisma.channel.create({ data: { workspaceId, type: 'DIRECT', createdByUserId, name: 'dm' } })`
- Route: clicking a member in WorkspaceSidebar → `findOrCreateDmChannel` → redirect to `/workspaces/[id]/chat/[channelId]`
- WorkspaceSidebar: add "Direct Messages" section below "Meeting Chats", list DM channels with other user's name
- The channel page already handles any channelId — DM channels work with existing `RealtimeChatPanel`

### Group 12: Organization (needs schema migration for tags)

**Tags schema migration:**
```sql
CREATE TABLE "Tag" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#085ac0',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("workspaceId", "name")
);
CREATE TABLE "NoteTag" (
  "noteId" UUID NOT NULL REFERENCES "Note"("id") ON DELETE CASCADE,
  "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE,
  PRIMARY KEY ("noteId", "tagId")
);
CREATE TABLE "MeetingTag" (
  "meetingId" UUID NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE,
  "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE,
  PRIMARY KEY ("meetingId", "tagId")
);
CREATE TABLE "FileTag" (
  "fileId" UUID NOT NULL REFERENCES "File"("id") ON DELETE CASCADE,
  "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE,
  PRIMARY KEY ("fileId", "tagId")
);
```

**31. Tags & labels:**
- After migration, create tag management UI on workspace home (OWNER/ADMIN create/delete tags)
- Add "Add tag" action on note cards, meeting cards, file cards
- Tag filter in notes list, meetings list, files list: `?tag=tagId` URL param
- Tag cloud on workspace home: list of tags with click-to-filter

**32. Note + workspace thumbnails:**
- Note cards: instead of blank card, show a colored gradient header (based on note title hash → one of 8 color palettes). For text notes: show first 2 lines of plain text. For whiteboards: show whiteboard icon on gradient.
- Workspace cards: show initials avatar (first letter of each word in workspace name) on a colored background (hash workspace name → color). Or allow workspace "color" selection in settings.
- No schema change needed — all computed from existing data.

### Group 13: Tutorials

**33. Simple onboarding modal:**
- Create `components/OnboardingModal.tsx` — "use client" component
- Show on first login: check `localStorage.getItem('onboarding-complete')` — if null, show modal
- 4 steps: (1) Welcome — create or join a workspace, (2) Invite teammates, (3) Schedule your first session, (4) Take notes together
- Each step: illustration + title + description + Next button
- Final step: "Let's go!" → dismiss + set localStorage
- Render in `app/(app)/layout.tsx` so it appears on the dashboard

**34. In-depth /help docs page:**
- Create `app/(app)/help/page.tsx`
- Sections: Getting started, Workspaces, Meetings, Notes & Whiteboards, Chat, Files, Calendar, Billing
- Each section: expandable `<details><summary>` accordion with text description
- Link from AppSidebar footer "Help" link (add below user info)
- Keep it simple — static server component, no database queries

---

## Migrations — Complete Order

**Already deployed:**
- `20260517130000_add_recurring_meetings` ✓

**Run billing migrations first (Priority 1):**
1. `20260518000000_billing_overhaul` — `SubscriptionPlan.ENTERPRISE`, `MeetingRecording.durationSeconds`, `AuditAction.BILLING_OVERAGE_CHARGED`

**Then run all remaining migrations together (after billing is complete):**
2. User profile fields: `institution`, `jobTitle`, `timezone`, `language`, `bio`, `darkMode`
3. Chat features: `MessageReaction`, `Message.attachmentFileId`, `Message.replyToId`, `Message.isPinned`, `ChannelType.DIRECT`
4. Tags: `Tag`, `NoteTag`, `MeetingTag`, `FileTag`

For each batch:
```bash
npx prisma migrate deploy
npx prisma generate
lsof -ti:3000 | xargs kill -9 && npm run dev
```

---

## Deployment Checklist (P8 — after all MVP items done)

- Hosting: Railway or Fly.io (Playwright Chromium needs persistent runtime, NOT Vercel serverless)
- Stripe live mode: complete identity verification, switch to `sk_live_...`/`pk_live_...`, recreate products, new price IDs, new webhook
- tldraw: start 100-day trial at tldraw.dev/get-a-license/trial on deployment day
- Supabase: upgrade to Pro ($25/mo), use Session Pooler URL for DATABASE_URL in production
- Resend: configure DKIM/SPF/DMARC for scribblapp.ca
- Email forwarding: billing@scribblapp.ca → dhyanthakkar0@gmail.com via ImprovMX
- Email forwarding: hello@scribblapp.ca → real feedback inbox via ImprovMX before relying on landing page feedback

---

## Start Here Next Session

**Frontend is PAUSED. Start with billing overhaul only.**

```
Project: /Users/Karuna/Desktop/Dhyan/Scribbl/scribbl
Run: npm run dev → localhost:3000
GitHub: github.com/dhyannnn/scribbl-v3

GIT STATUS:
- Commit 7670ca3 was pushed to origin/main.
- Current session changes are intentionally UNCOMMITTED. Do not commit unless Dhyan asks.
- Expected local modified/untracked work includes:
  - HANDOFF_MAY17.md
  - app/(app)/layout.tsx
  - app/page.tsx
  - components/AppSidebar.tsx
  - components/LandingPage.tsx
  - app/landing-feedback/
  - app/new/
  - components/LandingFeedbackForm.tsx
  - Unrelated image file: ChatGPT Image May 15, 2026, 01_34_09 PM.png — leave it alone.

MIGRATION STATUS:
- 20260517130000_add_recurring_meetings: DEPLOYED ✓ + prisma generate ✓
- Next batch (user profile + chat + tags): NOT YET — do not migrate until the current no-schema UI/product work is settled.

WHAT WAS JUST DONE:
- Landing page C11 pass:
  - generalized positioning beyond education/students
  - removed waitlist language
  - avoided named competitor comparison
  - added session-hub hero overlay, before/after section, screenshots, About, Meet the Team placeholders, feedback form, coming soon, org pricing card
- Dashboard/global actions:
  - generalized outside-workspace buttons through /new picker pages
  - kept New Note, Continue, Upload File
- AppSidebar:
  - removed Recent section
  - added Today widget
  - added Up next widget
  - fixed avatar display fallback/image rendering
  - made storage snapshot workspace-separated
  - added mobile top/bottom nav behavior

VERIFY BEFORE CONTINUING:
- npm run lint passes with two existing warnings:
  - app/pricing/page.tsx freeWorkspaceCount unused
  - tests/unit/artifact-lock.test.ts makeMeeting unused
- npx tsc --noEmit still fails on pre-existing tests/helpers/factories.ts seriesId optional/null typing issue.
- If dev server needs restarting, use npm run dev after checking port 3000.

START WITH:
1. Review the uncommitted UI changes in browser at desktop, tablet, and mobile widths.
2. Decide whether to keep/refine the landing page "oomph" sections and sidebar widgets.
3. Fix the pre-existing TypeScript test factory issue if Dhyan wants a fully clean typecheck before commit.
4. Next product build candidates:
   - Video Room redesign (C10)
   - Text editor / whiteboard polish items
   - Invite notifications gap (existing-user workspace invites should create in-app notification)
   - Organization pricing memo/deep dive before implementing org overage billing

Only after the UI/product pass is accepted: batch all schema migrations (user + chat + tags), run migrate/generate/restart, then continue items 15-34.
```
