# Scribbl MVP Handoff — May 19, 2026 (Session 3)

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
9. **Stripe webhooks 404 on localhost** — use `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
10. **Chat URL is `/workspaces/[id]/chat/[channelId]`** — NOT the old `?channel=ID` format. All links have been updated.
11. **AppSidebar has NO plan badge** — billing is per-workspace, not per-account. Plan info lives in WorkspaceSidebar.
12. **RealtimeChatPanel variants:** `variant="fullscreen"` (fills parent, no border — for standalone chat page), default `"card"` (for meeting hub). The fullscreen variant now has `flex-1 min-h-0` to prevent composer from being pushed off-screen.
13. **`cancelMeeting` now reads `cancelScope` from formData** — `"THIS"` or `"THIS_AND_FUTURE"`. CancelMeetingForm passes it.
14. **`updateMeetingDetails` now reads `editScope` from formData** — `"THIS"`, `"THIS_AND_FUTURE"`, or `"ALL"`. The hub form renders a radio group when `meeting.seriesId` is set.
15. **Stripe API 2026-04-22.dahlia: `current_period_start` and `current_period_end` do not exist on the `Stripe.Subscription` TypeScript type** — access them as `(stripeSub as any).current_period_start`. They exist at runtime; it's purely a type gap in this API version.
16. **Stripe `invoiceItems.create` in the dahlia API no longer accepts a top-level `price` field** — use `pricing: { price: priceId }` instead. See `lib/stripe-overage.ts`.
17. **`lib/env.ts` validates required env vars at startup** — it lists the 5 new `STRIPE_PRICE_*` env vars. If any are missing the server won't start. If you add new required env vars anywhere, add them to `lib/env.ts` too.
18. **Stripe checkout MUST set `subscription_data: { metadata: { workspaceId } }`** — `upgradeWorkspaceToPlan` now does this. Without it, `handleInvoiceCreated` can't find the workspace and overages are silently skipped. A DB fallback exists for older subscriptions but always set the metadata at checkout.
18. **tldraw image upload toolbar button is NOT blocked by `registerExternalContentHandler`** — the toolbar button uses a direct file input, bypassing the handler. `ScribblToolbar` renders individual tool item components, omitting `AssetToolbarItem` when `canUploadAssets=false`. Both mechanisms are active as belt-and-suspenders.
19. **Stripe 2026-04-22.dahlia: `current_period_start` and `current_period_end` do not exist on the Subscription object at all** — not just a TypeScript type gap, they are literally absent from the API response. Both `syncWorkspacePlanFromStripe` and the webhook `syncSubscription` guard with `if (rawPeriodStart)` before writing them. Do not unconditionally set those fields or the Prisma update will throw and the plan will silently stay FREE.
20. **Recording files live in Supabase's S3-compatible storage** (not a separate AWS bucket). `deleteWorkspaceFile` uses the Supabase admin client and it works. If you ever switch to an external S3 provider, add AWS SDK handling in the file deletion action.

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
- `components/AppSidebar.tsx` — server component, nav links: Dashboard, Calendar (/calendar), Notifications, Settings. Storage meter: owners/admins see shared workspace storage; regular members see their own private storage.
- `components/WorkspaceSidebar.tsx` — server component, workspace nav + channels. Billing link (owner-only) at the bottom above the user row. Order: Announcements → CHAT → Meeting Chats (newest 15) → Billing → User.
- `components/NavLink.tsx` — "use client", usePathname() for active states
- `components/RealtimeChatPanel.tsx` — fullscreen/card variants, avatar on every incoming message, resizable panel support
- `components/ChatPanelResizer.tsx` — drag handle between chat + right panel, updates `--scribbl-chat-panel-width` CSS var

---

## What Is Fully Built

### Auth & Account
Sign in/out, profile, password, account deletion, avatar upload, notification preferences.

### Workspace & Billing
TEAM/PROJECT/CLASS workspace types, OWNER/ADMIN/MEMBER roles. Full Stripe v22 billing: checkout, Customer Portal, overage billing (`invoice.created` handler), plan enforcement across all features. See Billing section below for complete details.

### Groups (P6 — Pro-gated)
Group management, meeting scheduling with group scope, group-scoped notifications + emails, OWNER/ADMIN bypass on all meeting views.

### Meetings
Schedule/edit/cancel, RSVP, meeting hub with shared/private notes, whiteboards, files, chat, fullscreen panels, moderation, hand-raise, LiveKit video (autoJoin, floating PiP, split video, standalone tab, emoji reactions).

### Recurring Meetings
Schema: `RecurrenceFrequency` enum (DAILY/WEEKLY/BIWEEKLY/MONTHLY), `seriesId`, `recurrence`, `seriesIndex`, `recurrenceEndsAt` on Meeting. Migration deployed ✓. Edit/cancel scope UI on meeting hub. `↻ weekly` badge in meetings list.

### Calendar
Workspace calendar and global calendar: 4 views (month/week/day/agenda), URL-driven nav. Dashboard mini calendar with blue dot on meeting days.

### Chat (P7 — complete)
Multi-channel: Announcements + CHAT channels per workspace. Chat URL: `/workspaces/[id]/chat/[channelId]`. Right panel: Recent Notes, Pinned Files, All Channels, Members. Soft card layout. Resizable right panel (drag handle, 220–520px, CSS var `--scribbl-chat-panel-width`). Avatar on every incoming message.

### Dashboard (P7 — complete)
Live meeting hero card, workspace grid, pending invites, upcoming meetings, activity feed (8 items), mini calendar widget, "Your Workspaces" section, quick-action strip (New Note, Continue, Upload File). AppSidebar has Today widget and Up Next widget.

### Workspace Home (P7 — complete)
Stats (members/notes/meetings), live session banner, settings collapsible (includes Delete Workspace danger zone — type name to confirm, cancels Stripe, cleans up Supabase storage, cascades DB), announcements panel, meetings + notes + files grid sections.

### Notes & Whiteboards
TipTap v3 full toolbar, KaTeX math, indent, PDF export via Playwright, expand/collapse shell. tldraw v3 custom toolbar, templates, multi-page, autosave. Liveblocks collaboration. See Whiteboard Gating section below for plan-specific rules.

### Files
Upload/open/download/rename/delete. Storage limit gating with shared/private split. Pin/unpin (OWNER/ADMIN, max 10 pinned). Files page shows two meters: shared storage and user private storage. Recording files can be deleted and storage is freed.

### Recordings (Pro-gated)
LiveKit Egress → MP4 → Supabase S3 → MeetingRecording + MeetingArtifact + workspace File. `durationSeconds` stored on completion for overage billing. `canRecord` prop chain: `meeting hub page.tsx → FloatingMeetingVideo → VideoPopoutShell → MeetingVideoRoom → ConferenceSurface → RecordingControls`.

### P7 Redesign Status
- ✅ C1: Login/Signup
- ✅ C2: Dashboard
- ✅ C3: Workspace Home
- ✅ C4: Chat
- ✅ C5: Notes List
- ✅ C6: Meetings List (with recurrence UI + ↻ badge)
- ✅ C7: Files (with split storage meters)
- ✅ C8: Members (with overage context), Groups, Billing (with Institution card + real recording meter), Audit Log
- ✅ C9: Meeting Hub
- ❌ C10: Video Room (still needs redesign)
- ❌ C11: Landing Page (structure exists, needs full sections + real screenshots)

### Screenshot assets (for C11)
- `public/screen.png` — text editor screenshot (hero for notes feature)
- `public/Screenshot 2026-05-17 at 1.11.45 PM.png` — whiteboard screenshot (hero for whiteboard feature)

---

## Billing — Complete

### Pricing model

| Tier | Price | Members | Shared storage | Private/user | Recordings | Whiteboards |
|---|---|---|---|---|---|---|
| **Free** | $0 | 3 max (hard cap) | 500 MB | 200 MB | None | Private only (solo, no PDF, no image uploads) |
| **Pro** | $25 CAD/workspace/mo | 20 incl. · +$1 CAD/mo per extra | 10 GB | 2 GB | 5 hrs/mo · +$1.50 CAD/hr | Full (shared + private, PDF, image uploads) |
| **Institution** | $65 CAD/workspace/mo | 50 incl. · +$0.50 CAD/mo per extra | 50 GB | 5 GB | 20 hrs/mo · +$1.50 CAD/hr | Full + audit log, priority support |
| **Enterprise** | $250+ CAD/workspace/mo · annual | Custom | Custom | Custom | Custom | Full + SLA, dedicated support |

**Overage billing:** member and recording overages added as Stripe invoice line items on `invoice.created`, before the invoice finalizes. `lib/stripe-overage.ts` handles this. Each overage type (member/recording) is in its own try/catch so one failure doesn't block the other.

**Enterprise:** custom-invoiced. No checkout flow. Owner contacts sales → Dhyan creates manual subscription in Stripe dashboard.

**Fixed cost reminder:**
- tldraw: $500/mo · Supabase Pro: $25/mo · Liveblocks Pro: $99/mo · Resend: $20/mo · Hosting: $41/mo = **$685/mo**
- **Email tldraw at sales@tldraw.com for startup pricing on deployment day** — 80% discount drops to ~$185/mo

### Stripe env vars required
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_BASE_CAD          # $25 CAD/mo recurring
STRIPE_PRICE_INSTITUTION_BASE_CAD  # $65 CAD/mo recurring
STRIPE_PRICE_PRO_MEMBER_OVERAGE_CAD          # $1.00 CAD one-time
STRIPE_PRICE_INSTITUTION_MEMBER_OVERAGE_CAD  # $0.50 CAD one-time
STRIPE_PRICE_RECORDING_OVERAGE_CAD           # $1.50 CAD one-time
```
Old names `STRIPE_PRO_PRICE_ID` / `STRIPE_INSTITUTION_PRICE_ID` are still supported as a fallback in `planFromPriceId`.

### Webhook events required
`customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.created`

### Key billing files
- `lib/billing.ts` — all constants and helpers (`getSharedStorageLimitBytes`, `getPrivateStorageLimitPerUserBytes`, `getWorkspaceSharedStorageBytes`, `getUserPrivateStorageBytes`, `getWorkspaceRecordingSecondsThisPeriod`, `getIncludedMemberLimit`, etc.)
- `lib/stripe-overage.ts` — `handleInvoiceCreated`
- `app/workspaces/[id]/billing/billing-actions.ts` — `upgradeWorkspaceToPlan`, `openBillingPortal`, `refreshBillingStatus`
- `app/api/stripe/webhook/route.ts` — all webhook event handlers

### Feature gates
- **Workspace creation:** Free = 1 owned workspace; any paid workspace unlocks unlimited
- **Members:** Free = hard cap at 3 (checked at invite creation counting ACTIVE+INVITED, and at acceptance); Pro/Institution = no cap, overages billed on next invoice
- **Groups:** Pro+ only
- **Recordings:** Pro+ only; hard-blocked at 3× included hours to prevent runaway costs
- **Whiteboards:** see section below
- **Audit log:** Institution + Enterprise only

---

## Whiteboard Gating

| Context | Free | Pro+ |
|---|---|---|
| Create private whiteboard | ✓ | ✓ |
| Edit private whiteboard | ✓ (solo) | ✓ |
| Create shared whiteboard | ✗ (Pro badge on button) | ✓ |
| Edit shared whiteboard | ✗ (view-only banner) | ✓ |
| Meeting private whiteboard | ✓ | ✓ |
| Meeting shared whiteboard | ✗ | ✓ |
| Whiteboard PDF export | ✗ (menu item hidden) | ✓ |
| Whiteboard image/asset uploads | ✗ (toolbar button removed + handler blocked) | ✓ |

**Implementation notes:**
- `TldrawWhiteboardEditor` props: `canExportPdf`, `canUploadAssets`. When `canUploadAssets=false`, `ScribblToolbar` renders individual tool items (`SelectToolbarItem`, `HandToolbarItem`, `DrawToolbarItem`, etc.) and omits `AssetToolbarItem`. A `registerExternalContentHandler("files", () => {})` override also blocks drag-and-drop as a backup.
- `ExportCtx` context carries `{ title, canExportPdf, canUploadAssets }` into the tldraw component tree. `ScribblToolbar` and `CustomExportMenu` both read from it.
- `createWhiteboardNote` / `saveWhiteboardNote` — only block `WORKSPACE_SHARED` on Free. Private whiteboards pass through.
- `createMeetingNote` / `saveMeetingWhiteboard` — only block `scope === "SHARED"` / `visibility === "WORKSPACE_SHARED"` on Free.
- Existing shared whiteboards on a downgraded Free workspace: `canEdit = false` is set in the page (only for WORKSPACE_SHARED + plan FREE), view-only banner shown.

---

## Collaborative Whiteboard — Bug Fix (May 19)

`components/tldraw-yjs-store.ts` had three bugs causing drawings to not appear for remote users (while cursors still worked fine):

1. **Root cause:** `applyRemoteChanges` called `yStore.get(id)` — an O(n) array iteration that could return stale data during rapid drawing. Fixed to use `change.newValue` directly from the Yjs change event.
2. **`store.listen` without `source: "user"` filter** — fired for both user and remote changes, causing unnecessary overhead. Fixed to `{ source: "user", scope: "document" }`.
3. **`"binding"` missing from `isSyncedDocumentRecord`** — tldraw v3 uses binding records for arrows/connectors. They weren't syncing. Added `"binding"` to the list.

---

## Storage Display

Storage is computed from the DB on every page load (no cache). Deleting a file record immediately frees the quota.

- **AppSidebar:** owners/admins see shared workspace storage vs shared limit per workspace. Regular members see their own private storage vs private limit per workspace.
- **Files page:** two meters — "Shared storage" and "Your private storage" — with warning/critical states and upgrade prompts for Free plan. `private-storage-limit` error key handled alongside `storage-limit`.
- **Billing page:** shared storage meter + your private storage meter + recording hours meter (real data, not hardcoded).
- **Members page:** overage member count and projected extra charge shown to owner when above included limit.

---

## Migrations — Complete Status

**Deployed to live DB:**
- `20260517130000_add_recurring_meetings` ✓
- `20260518000000_billing_overhaul` ✓ — adds `SubscriptionPlan.ENTERPRISE`, `AuditAction.BILLING_OVERAGE_CHARGED`, `MeetingRecording.durationSeconds`, `Subscription.currentPeriodStart`

**Still to run (batch together when ready to build those features):**
1. User profile: `institution`, `jobTitle`, `timezone`, `language`, `bio`, `darkMode` on User model
2. Chat features: `MessageReaction` table, `Message.attachmentFileId`, `Message.replyToId`, `Message.isPinned`, `ChannelType.DIRECT`
3. Tags: `Tag`, `NoteTag`, `MeetingTag`, `FileTag` tables

For each batch:
```bash
npx prisma migrate deploy
npx prisma generate
lsof -ti:3000 | xargs kill -9 && npm run dev
```

---

## MVP Todo List

Billing is fully complete. All 34 items are now unblocked. Group 2 items (4, 5, 6) and item 17 are also done. Work through the rest in order.

### Group 1: Landing page (no schema changes)

**1. C11 Landing page** — `components/LandingPage.tsx`
- Structure and most sections exist from Session 2. Still needs: real screenshots wired in with `<Image>` tags, Before/After section fully built, Features section with real screenshots, How it works, generic comparison section, About, Meet the Team, CTA + footer.
- `public/screen.png` — text editor hero. `public/Screenshot 2026-05-17 at 1.11.45 PM.png` — whiteboard hero.
- Pricing section is already updated with the correct model (Free/Pro/Institution tiers). Do not revert.
- Positioning: general-purpose (teams, companies, labs, departments). Not education-only.
- Meet the Team: placeholder photo blocks until real names/photos ready. "Built by four graduate and undergraduate students."

**2. Feedback/review widget** — already in `components/LandingPage.tsx` and `app/landing-feedback/`. Verify it works end-to-end. Before launch: create ImprovMX forwarding for `hello@scribblapp.ca`.

**3. "Coming in next release" section** — already added in Session 2. Review and refine copy if needed.

### Group 2: Dashboard & navigation — DONE ✅

**4–6.** Activity feed cap, quick-action strip, AppSidebar improvements — all done.

### Group 3: Text editor redesign (no schema changes)

**7. Text editor top bar** — `components/TextNoteEditor.tsx` / `NoteEditorShell.tsx`
- Editable title (calls `updateNoteTitle` action), autosave status pill, Liveblocks presence avatars (from `useOthers()` in `lib/tiptap/liveblocks-cursors.ts`), Export PDF button (`<a href="/api/notes/[id]/export">`), Share button (copy link to clipboard).
- Style: `h-12 border-b bg-surface flex items-center justify-between px-5`

**8. Text editor toolbar restyle** — `components/NoteToolbar.tsx`
- Replace old green colors with design tokens: `--color-secondary` for active state, `rounded-full` buttons, `--color-border` dividers.

**9. Text editor bottom bar** — `components/TextNoteEditor.tsx`
- Fixed bottom bar: `h-10 border-t bg-surface flex items-center px-5 gap-4 text-xs font-mono text-muted`
- Word count via `editor.getText().split(/\s+/).filter(Boolean).length`, character count, autosave status, static "100%" zoom.

### Group 4: Whiteboard redesign (no schema changes)

**10. Whiteboard top bar** — `components/TldrawWhiteboardEditor.tsx`
- Same pattern as text editor top bar: editable title (already synced via `yMeta`), autosave pill (already working), Liveblocks presence avatars, Share button. Add a bar above the canvas.

**11. Whiteboard bottom toolbar restyle** — `components/TldrawWhiteboardEditor.tsx`
- `ScribblToolbar` already exists and renders individual tool items. Restyle as a floating pill at bottom center.
- Style: `fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-1 rounded-full border bg-surface shadow-lg px-3 py-2`
- **Important:** preserve the existing `canUploadAssets` logic — `ScribblToolbar` reads from `ExportCtx` and conditionally omits `AssetToolbarItem`. Don't break that.

**12. Whiteboard right panel** — CSS overrides in `app/globals.css` targeting `.tl-*` class names to align with design tokens.

### Group 5: Slash commands (no schema changes)

**13. Slash commands** — `components/TextNoteEditor.tsx`
- `@tiptap/suggestion` (check if already a transitive dep before installing).
- Create `lib/tiptap/slash-commands.ts`. Commands: H1/H2/H3, bullet, numbered list, code block, KaTeX math, table, divider, quote.
- Trigger: `/` key → floating dropdown → Enter or click to insert.

### Group 6: Video room redesign (no schema changes)

**14. Video room C10** — `app/workspaces/[id]/meetings/[meetingId]/video/`
Files: `page.tsx`, `MeetingVideoRoom.tsx`, `VideoPopoutShell.tsx`, `FloatingMeetingVideo.tsx`, `ConferenceSurface.tsx`, `RecordingControls.tsx`
- Dark theme: `bg-[var(--color-live)]` (#131b2e) as base. Accent colors: green → `--color-secondary` blue.
- Controls bar: restyle as floating pill bar at bottom.
- Add speaker spotlight vs gallery view toggle (`viewMode` state: `"gallery" | "spotlight"`).
- **Do not touch LiveKit/Liveblocks hooks.** Only className strings and layout wrappers.
- Preserve `canRecord` prop chain: `page.tsx → FloatingMeetingVideo → VideoPopoutShell → MeetingVideoRoom → ConferenceSurface → RecordingControls`.

### Group 7: Account & billing pages

**15. User schema extension** — `prisma/schema.prisma` + new migration
Add to `User` model:
```sql
ALTER TABLE "User" ADD COLUMN "institution" TEXT;
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT DEFAULT 'UTC';
ALTER TABLE "User" ADD COLUMN "language" TEXT DEFAULT 'en';
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "darkMode" BOOLEAN NOT NULL DEFAULT false;
```
Run: `npx prisma migrate deploy && npx prisma generate`, restart dev server.

**16. Account page redesign** — `app/account/page.tsx`
- Profile photo (existing avatar upload), display name, email (read-only).
- New fields: institution (text), jobTitle (dropdown: Student, TA/Researcher, Professor, Engineer, Manager, Other), bio (textarea).
- Notification toggles restyled as iOS-style toggles.
- Region & Time: timezone + language dropdowns.
- "Support Center" card linking to `/help`.
- 2-col desktop layout. Extend `updateProfile` server action in `app/account/actions.ts`.

**17. Billing page redesign** — DONE ✅
Already rebuilt in Session 3 with: active plan card, real storage meters (shared + private), real recording hours meter, over-limit member warning, Pro/Institution upgrade cards, Enterprise contact-sales, manage subscription via Stripe portal, `refreshBillingStatus` button. Billing link now in WorkspaceSidebar (owner-only).

### Group 8: Dark/light mode (needs User.darkMode from item 15)

**18. Light/dark mode** — multi-file change
- CSS: `[data-theme="dark"]` block in `app/globals.css` redefining all `--color-*` tokens.
- `components/ThemeToggle.tsx` — reads/writes `localStorage` + DB `User.darkMode`.
- Add to AppSidebar and WorkspaceSidebar near user info.
- `app/layout.tsx`: fetch `darkMode` on load, set `data-theme` on `<html>` to avoid flash.

### Group 8.5: Organization pricing model (research — no code yet)

**18A. Organization pricing deep dive**
Before implementing any org-tier overage billing, produce a written memo covering: all variable cost drivers (Supabase, LiveKit, Liveblocks, Resend, Stripe fees, hosting), worst-case abuse scenarios, gross margin at low/medium/high usage, recommended public pricing copy, internal alert thresholds. Do not implement org overage billing until memo is reviewed.

### Group 9: Command palette (no schema changes)

**19. Command palette (⌘K)** — new `components/CommandPalette.tsx` + `app/layout.tsx`
- Keyboard shortcut: `(e.metaKey || e.ctrlKey) && e.key === 'k'` → open/close.
- Modal overlay: `fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[20vh]`.
- Create `/api/command-search?q=X` — queries notes, meetings, workspaces, channels for the current user.
- Sections: Recent, Workspaces, Notes, Meetings, Actions. Press Enter or click to navigate.
- Add `<CommandPalette />` to `app/layout.tsx`.

### Group 10: Global search (no schema changes)

**20. Global search** — `app/(app)/search/page.tsx`
- Server component, `?q=search+term` URL param.
- Sections: Notes, Meetings, Files, Chat messages — grouped by type with icons.
- Search input in AppSidebar or as expanding icon.

### Group 11: Chat features (needs schema migration — batch together)

**Schema — create ONE migration for all chat items:**
```sql
CREATE TABLE "MessageReaction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId" UUID NOT NULL REFERENCES "Message"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("messageId", "userId", "emoji")
);
ALTER TABLE "Message" ADD COLUMN "attachmentFileId" UUID REFERENCES "File"("id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD COLUMN "replyToId" UUID REFERENCES "Message"("id") ON DELETE SET NULL;
ALTER TABLE "Message" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "ChannelType" ADD VALUE 'DIRECT';
```
Also update `prisma/schema.prisma` with the `MessageReaction` model and new `Message` fields (`attachmentFileId`, `replyToId`, `isPinned`, `reactions MessageReaction[]`).

**21. Message reactions** — emoji row on hover, reaction pills below message, Liveblocks broadcast (`reaction-added` / `reaction-removed`).
**22. File attachments** — 📎 button in composer, multipart upload to `workspaces/{id}/chat-attachments/`, inline image or download card. Enforce workspace shared storage quota via `getWorkspaceSharedStorageBytes`.
**23. Code blocks** — parse ` ```lang\n...\n``` `, render with `highlight.js` (sync, client-side).
**24. LaTeX math** — parse `$inline$` / `$$block$$`, render with KaTeX (already installed).
**25. Link unfurl previews** — `app/api/unfurl/route.ts` fetches OG tags server-side, show preview card below message.
**26. Message threading** — "Reply" button, `replyToId`, thread right-panel.
**27. @mentions** — `@` dropdown, store as `@[userId:displayName]`, create in-app notifications for mentioned users.
**28. Message pinning** — OWNER/ADMIN only, pinned messages section in chat right panel.
**29. Search within channel** — `app/api/chat/search/route.ts`, expanding search icon in channel header.
**30. Direct messages** — `findOrCreateDmChannel`, WorkspaceSidebar DM section, `ChannelType.DIRECT`.

### Group 12: Organization (needs schema migration for tags)

**Tags schema:**
```sql
CREATE TABLE "Tag" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "workspaceId" UUID NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#085ac0', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("workspaceId", "name"));
CREATE TABLE "NoteTag" ("noteId" UUID NOT NULL REFERENCES "Note"("id") ON DELETE CASCADE, "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE, PRIMARY KEY ("noteId", "tagId"));
CREATE TABLE "MeetingTag" ("meetingId" UUID NOT NULL REFERENCES "Meeting"("id") ON DELETE CASCADE, "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE, PRIMARY KEY ("meetingId", "tagId"));
CREATE TABLE "FileTag" ("fileId" UUID NOT NULL REFERENCES "File"("id") ON DELETE CASCADE, "tagId" UUID NOT NULL REFERENCES "Tag"("id") ON DELETE CASCADE, PRIMARY KEY ("fileId", "tagId"));
```

**31. Tags & labels** — tag management on workspace home (OWNER/ADMIN), add-tag on cards, `?tag=tagId` filter in notes/meetings/files lists, tag cloud on workspace home.
**32. Note + workspace thumbnails** — colored gradient header on note cards (hash title → palette), whiteboard icon on whiteboard cards, initials avatar on workspace cards.

### Group 13: Tutorials

**33. Onboarding modal** — `components/OnboardingModal.tsx`. 4 steps. `localStorage.getItem('onboarding-complete')` gate. Add to `app/(app)/layout.tsx`.
**34. /help docs page** — `app/(app)/help/page.tsx`. Static server component, `<details><summary>` accordion sections. Link from AppSidebar footer.

---

## Deployment Checklist (P8 — after all MVP items done)

- Hosting: Railway or Fly.io (Playwright Chromium needs persistent runtime — NOT Vercel serverless)
- Stripe live mode: complete identity verification, switch to `sk_live_...`/`pk_live_...`, recreate all 5 products + price IDs in live mode, new webhook endpoint, add `invoice.created` to enabled events
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
- All Session 3 changes are UNCOMMITTED. Do not commit unless Dhyan asks.
- Lint: npm run lint → 1 warning only (tests/unit/artifact-lock.test.ts makeMeeting unused — pre-existing, ignore).
- No new TypeScript errors. Pre-existing: tests/helpers/factories.ts seriesId optional/null typing.

MIGRATION STATUS:
- 20260517130000_add_recurring_meetings: DEPLOYED ✓
- 20260518000000_billing_overhaul: DEPLOYED ✓ + prisma generate ✓
- Next batch (user profile + chat + tags): NOT YET — batch and run when ready to build those features.

STRIPE SETUP REQUIRED (manual — do in test mode first):
The code is done. Dhyan still needs to:
1. Create 5 products in Stripe (Pro base $25 CAD/mo, Institution base $65 CAD/mo,
   Pro member overage $1.00 one-time, Institution member overage $0.50 one-time,
   Recording hour overage $1.50 one-time)
2. Set the 5 STRIPE_PRICE_* env vars with the new price IDs
3. Add invoice.created to the webhook endpoint's enabled events
4. Test the checkout flows before going live

WHAT WAS DONE IN SESSION 3:
- Full billing overhaul: pricing model, storage split, feature gates, overage billing,
  billing page redesign, pricing page, landing page pricing section
- 20+ bug fixes: invite limits, recording duration, whiteboard gates, overage metadata,
  audit log for Enterprise, workspace deletion, file deletion for recordings, etc.
- Collaborative whiteboard fixed: drawings now sync correctly between users
- Whiteboard gating: private whiteboards available on Free (solo, no PDF, no image uploads);
  shared whiteboards Pro+ only; image toolbar button removed from Free tldraw instance
- Storage display: split into shared vs private everywhere (AppSidebar, files page, billing page)
- Workspace deletion: fully cleans up Stripe subscription + Supabase storage

START WITH:
1. Verify whiteboard gating in browser:
   - Free workspace → Notes → "New Whiteboard" button has Pro badge
   - Free workspace → Notes → More → "Private Whiteboard" works, creates editable board
   - Private whiteboard on Free: image toolbar button absent, PDF option absent, can draw
   - Shared whiteboard on Free (if one exists): shows view-only banner
2. Verify real-time collaborative whiteboard: open two browser windows, draw in one, 
   confirm it appears in the other. Cursors and drawings should both sync.
3. Pick up the MVP frontend list:
   - C10 Video Room redesign (item 14) — last major page still needing redesign
   - Text editor polish (items 7, 8, 9) — quick wins, no schema changes
   - Command palette (item 19) — high UX value, no schema changes
4. Schema migrations (user profile + chat + tags) when ready to build those features.
```
