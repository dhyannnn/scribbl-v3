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

## MVP Todo List (34 items — start here next session)

Work through these in order. Items 1–3 need no schema changes. Items that need schema changes are noted — batch all schema changes and run migrate/generate once.

### Group 1: Landing page (no schema changes)

**1. C11 Landing page** — `components/LandingPage.tsx`
- Use `public/screen.png` as the text editor hero image (TipTap editor screenshot)
- Use `public/Screenshot 2026-05-17 at 1.11.45 PM.png` as the whiteboard hero image
- Use `<Image>` tags with proper `next/image` imports
- Sections: Hero (headline + sub + CTA buttons "Start free" → /login, "View pricing" → /pricing), Features (with real screenshots), How it works (vs Zoom + Miro), Pricing (already exists, restyle with design tokens), Feedback widget, Coming Soon, CTA + footer
- Keep existing indigo/purple palette — it already matches the design system

**2. Feedback/review widget** — add to `components/LandingPage.tsx`
- Simple form: textarea "What would you like to see?" + email field + submit
- Server action that sends to `hello@scribblapp.ca` via Resend (same pattern as meeting emails)
- Show "Thank you" message on submit
- Style as a section: "Shape what comes next — tell us what you want"

**3. "Coming in next release" section** — add to `components/LandingPage.tsx`
- Feature cards for: AI meeting summaries, AI note assistant, Version history, Wiki-style note linking, Workspace analytics, Mobile app, Message threading, @mentions, Direct messages, Meeting templates
- Style as a grid of pill badges or feature cards
- CTA: "Want early access? Join the waitlist" → link to a Tally/Typeform form or the feedback widget

### Group 2: Dashboard & navigation (no schema changes)

**4. Cap activity feed** — `app/page.tsx`
- Change `getWorkspaceActivity(workspaceIds, 15)` → `getWorkspaceActivity(workspaceIds, 8)`
- Add "View all →" link to a future `/activity` page for now — can link to `/` as placeholder

**5. Quick-action strip** — `app/page.tsx`
- Add a row of icon+label buttons below the workspace grid and above the 2-col section
- Actions: "New Note" (→ first workspace's notes page), "Schedule Session" (→ first workspace's meetings page), "Upload File" (→ first workspace's files page)
- Style as horizontal pill row: `flex gap-3`, each is `rounded-full border bg-surface px-4 py-2 font-semibold text-sm`

**6. AppSidebar improvements** — `components/AppSidebar.tsx`
- Add "Up next" widget: query the next upcoming meeting across all user workspaces (already have `upcomingMeetings` on the dashboard page — pass down or re-query in AppSidebar)
- Actually AppSidebar is a server component — add a small query: `prisma.meeting.findFirst({ where: { workspaceId: { in: workspaceIds }, canceledAt: null, startsAt: { gte: now } }, orderBy: { startsAt: 'asc' }, select: { id: true, title: true, startsAt: true, workspaceId: true } })`
- Show as a small card above the nav items: title, time, "Join →" link
- Add "Recent" workspace row: last 3 workspaces the user belongs to as small icon+name links

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

## Migrations to Run Next Session (Batch Together)

Run these all at once before implementing items 15–35:

1. User profile fields (item 15): `institution`, `jobTitle`, `timezone`, `language`, `bio`, `darkMode`
2. Chat features (items 21–30): `MessageReaction` model, `Message.attachmentFileId`, `Message.replyToId`, `Message.isPinned`, `ChannelType.DIRECT`
3. Tags (items 31): `Tag`, `NoteTag`, `MeetingTag`, `FileTag` tables

Create all three as a single migration file or three separate ones, then:
```bash
npx prisma migrate deploy
npx prisma generate
lsof -ti:3000 | xargs kill -9
npm run dev
```

---

## Deployment Checklist (P8 — after all MVP items done)

- Hosting: Railway or Fly.io (Playwright Chromium needs persistent runtime, NOT Vercel serverless)
- Stripe live mode: complete identity verification, switch to `sk_live_...`/`pk_live_...`, recreate products, new price IDs, new webhook
- tldraw: start 100-day trial at tldraw.dev/get-a-license/trial on deployment day
- Supabase: upgrade to Pro ($25/mo), use Session Pooler URL for DATABASE_URL in production
- Resend: configure DKIM/SPF/DMARC for scribblapp.ca
- Email forwarding: billing@scribblapp.ca → dhyanthakkar0@gmail.com via ImprovMX

---

## Start Here Next Session

```
Project: /Users/Karuna/Desktop/Dhyan/Scribbl/scribbl
Run: npm run dev → localhost:3000
GitHub: github.com/dhyannnn/scribbl-v3

MIGRATION STATUS:
- 20260517130000_add_recurring_meetings: DEPLOYED ✓ + prisma generate ✓
- Next batch (user profile + chat + tags): NOT YET — do items 1-13 first, then batch migrate

START WITH:
Item 1 — Landing page (C11) in components/LandingPage.tsx
  → Use public/screen.png for text editor hero
  → Use public/Screenshot 2026-05-17 at 1.11.45 PM.png for whiteboard hero
  → Then items 2, 3 (feedback widget, coming soon section) in same file

Then items 4-6 (dashboard), 7-13 (editors + slash commands), 14 (video room)

Then batch all schema migrations (user + chat + tags), run migrate/generate/restart

Then items 15-34 in order
```
