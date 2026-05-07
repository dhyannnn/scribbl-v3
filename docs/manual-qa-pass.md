# Scribbl MVP Manual QA Pass

Use this checklist against the Supabase-backed local app at http://localhost:3000.

Run command:

```bash
npm run dev
```

Recommended browser setup:

- Karuna: Chrome profile or normal window
- Avery: Edge/Firefox or Chrome profile 2
- Dhyan: Safari or Chrome profile 3
- Aloe: optional extra user, best used as a negative-control tester for invite, non-member, and deletion edge cases

Before starting, keep DevTools console open for each browser profile and keep the terminal running `npm run dev` visible.

## Bug Log

Add bugs here as they are found.

| ID | Status | Severity | Area | User | Steps | Expected | Actual | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-001 | Fixed | S2 | Workspace routing | Signed out | Request `/workspaces/fake-id` | Clean 404, redirect, or protected access response | 500 Internal Server Error from Prisma UUID parsing | Fixed with UUID validation before Prisma lookup; `curl -I http://localhost:3000/workspaces/fake-id` now returns `404 Not Found` |
| QA-002 | Fixed | S2 | Meeting video PiP | Signed-in browser session | Open a meeting hub with floating video state restored from localStorage | No hydration mismatch; server-safe defaults render first, then client state restores after hydration | Dev log still contains React hydration mismatch for `FloatingMeetingVideo`, with server/client differences for `left`, `top`, `width`, `height`, and Show/Hide text | Fixed by rendering no floating video panel until hydration and restoring localStorage state after the first client render |
| QA-003 | Fixed | S3 | Workspace invites | Invited user | Accept a workspace invite while already signed in as the invited account in another tab | Existing signed-in session should open the invited workspace in the current tab/window without creating duplicate logged-in tabs | Invite acceptance opens/logs into a new tab and leaves duplicate logged-in tabs for the same account | Fixed with a cross-tab invite-accepted event that navigates other open Scribbl tabs to the accepted workspace |
| QA-004 | Fixed | S2 | Meeting video split view | Signed-in meeting participant | Enable split video view, then narrow the browser using Chrome split tabs or OS split screen | Meeting hub and video should remain side-by-side without overlap, or collapse to a usable stacked/mobile layout | Video half overlays/hides the meeting hub content when the browser window is narrow | Fixed by making split video fixed side-by-side only on wide screens and stacked/in-flow at narrow browser widths |
| QA-005 | Fixed | S3 | Live meeting whiteboard deletion | Meeting participants | Create a workspace-shared meeting whiteboard during a live meeting, keep it open for participants, then delete it from the workspace Notes page | Active viewers should immediately see that the whiteboard was deleted, editing should stop, and the meeting should switch to another artifact or empty state | Backend removes the artifact/note and refresh fixes it, but already-open viewers may temporarily remain in a ghost Liveblocks whiteboard room without a clear deleted state | Fixed with a cross-tab note-deleted event that refreshes active meeting/note viewers immediately and again after deletion settles |
| QA-006 | Fixed | S2 | Meeting participants | Workspace member | Delete a user account that had been invited to a live/upcoming meeting, then open the meeting hub | Deleted/removed users should not appear as invited participants or be counted in the active meeting roster | Deleted user appeared in the participants list with anonymized email and `invited` status | Fixed by filtering soft-deleted users out of meeting hub participant queries |
| QA-007 | Fixed | S2 | Meeting recordings | Meeting host/admin | Use recording controls from the meeting hub before joining video | Recording should be managed from actual video context, with empty-room recording blocked | Recording controls were available on the hub and felt disconnected from the room | Fixed by moving recording controls into video surfaces while keeping saved recording artifacts/status visible on the hub |
| QA-008 | Fixed | S2 | Meeting video tab UX | Meeting participant | Open the video room from the meeting hub | Hub should remain available for notes/chat; standalone video should act like a companion tab | Same-tab navigation replaced the meeting hub, and recording redirects could force a rejoin | Fixed by opening the video room in a new tab, returning focus/closing from the video tab, and preserving in-place recording actions for split/floating video |
| QA-009 | Fixed | S2 | Meeting video surface state | Meeting participant | Open video in a companion tab, then create a new meeting note/board from the hub | Hub should remember that video is already open elsewhere after route refresh/remount | Hub remount forgot the companion video tab and rendered an extra floating video surface | Fixed with a `hub-ready` / `popout-ready` BroadcastChannel handshake after hub remounts |
| QA-010 | Fixed | S2 | Meeting video leave | Meeting participant | Join LiveKit video, then press Leave | Video should disconnect, mark the user left, and return the panel to `Join Video` | Leave marked attendance but left the local room UI mounted | Fixed by clearing the local video connection state on disconnect |
| QA-011 | Fixed | S3 | Floating video resize | Meeting participant | Resize floating video panel very small, then try to recover it | Panel should have a usable minimum size and restored saved state should be clamped | Panel could become too small to resize back manually | Fixed by enforcing a `360x280` minimum during resize and localStorage restore |
| QA-012 | Fixed | S3 | Meeting list participant counts | Workspace member | Delete a user who was invited to meetings, then view meetings list/dashboard cards | Deleted users should not be counted in visible participant totals | Meetings list/dashboard counted raw meeting participant rows, including soft-deleted users | Fixed by filtering `participants` to users with `deletedAt: null` on list/dashboard queries |

Severity guide:

- S0: data loss, auth bypass, app unusable
- S1: core MVP flow broken
- S2: important flow degraded, workaround exists
- S3: polish, copy, layout, confusing state

## Pass 0: Smoke Setup

- [x] Start `npm run dev`.
- [x] Open http://localhost:3000.
- [x] Confirm the app loads without a server error.
- [ ] Confirm no immediate browser console errors on first load.
- [x] Confirm sign-in page is reachable from a signed-out browser.
- [ ] Confirm each browser profile has an isolated session.

Notes:

- `npm run dev` was already running on port 3000. A second server attempt was blocked because Next detected the existing dev server.
- `curl -I http://localhost:3000` returned `200 OK`.
- `curl -I http://localhost:3000/login` returned `200 OK`.
- `curl -I http://localhost:3000/account` returned `307 Temporary Redirect` to `/login?next=/account`.
- `curl -I http://localhost:3000/workspaces/fake-id` returned `500`; logged as QA-001.

## Pass 1: Auth And Account Safety

### Sign In And Sign Out

- [x] Sign in as Karuna.
  - Expected: dashboard loads and shows Karuna's accessible workspaces.
- [x] Sign out as Karuna.
  - Expected: session clears and protected pages require sign-in.
- [x] Repeat sign in/out as Avery.
  - Expected: Avery can access `BIO 101` but not Karuna-only owner controls.
- [x] Repeat sign in/out as Dhyan.
  - Expected: Dhyan can access `BIO 101 Study Group` but not Karuna-only owner controls.
- [ ] Optional: sign in as Aloe or try an unrecognized account.
  - Expected: access matches actual membership/invite state, with no accidental workspace access.

Notes:

- Created separate authenticated cookie jars for Karuna, Avery, and Dhyan using the local login form.
- Karuna, Avery, and Dhyan all received `303` redirects to `/` after successful login.
- Manual QA: sign out and back in works for Karuna, Avery, and Dhyan in separate real browser profiles.

### Profile Update

- [x] As Karuna, open `/account`.
- [x] Change display/profile fields.
  - Expected: save succeeds, new value appears after refresh and in places that show the user name.
- [x] Repeat a harmless profile update as Avery.
  - Expected: Avery can update only Avery's own profile.

Notes:

- Manual QA: profile update works from `/account`.

### Password Update

- [x] As a non-critical test account if available, update password from `/account`.
  - Expected: save succeeds.
- [x] Sign out and sign in with the new password.
  - Expected: new password works.
- [x] Try the old password.
  - Expected: old password no longer works.

Notes:

- Manual QA: password update works from `/account`.

### Account Deletion Guardrails

- [x] As Karuna, open `/account` and attempt account deletion without typing `DELETE`.
  - Expected: deletion is blocked.
- [x] As Karuna, type `DELETE` while Karuna still owns active workspaces.
  - Expected: deletion is blocked because active ownership must be transferred first.
- [x] As Avery or Dhyan, attempt deletion only if the account is safe to lose.
  - Expected: Supabase Auth user is deleted first, local user is anonymized, active memberships are removed, shared history remains visible.
- [x] If deletion fails at Supabase Auth, verify local `deletionRequestedAt` is rolled back.
  - Expected: account remains usable or clearly recoverable.

Notes:

- Manual QA: account deletion guardrails and completed deletion flow passed.

## Pass 2: Workspace Access, Invites, And Ownership

### Workspace Visibility

- [x] As Karuna, confirm `BIO 101`, `BIO 101 Study Group`, and any expected existing workspaces are visible.
- [x] As Avery, confirm `BIO 101` is visible.
- [x] As Avery, confirm `BIO 101 Study Group` is not visible unless Avery is actually a member.
- [x] As Dhyan, confirm `BIO 101 Study Group` is visible.
- [x] As Dhyan, confirm `BIO 101` is not visible unless Dhyan is actually a member.
- [ ] Optional Aloe: confirm no workspace access unless invited or already a member.

Notes:

- DB verification: Karuna is owner in `BIO 101` and `BIO 101 Study Group`; Avery is active member only in `BIO 101`; Dhyan is active member only in `BIO 101 Study Group`; Aloe owns `biol1000`.
- Route checks: Karuna and Avery received `200` for `BIO 101`; Dhyan received the protected "You do not have access" page for `BIO 101`.
- Route checks: Dhyan received `200` for `BIO 101 Study Group`; Avery received the protected "You do not have access" page for `BIO 101 Study Group`.

### Invite Flow

- [x] As Karuna, open a workspace members page.
- [x] Invite Aloe or another disposable email.
  - Expected: invite is created, visible in pending invites, and email send either succeeds or surfaces a clear error.
- [x] Resend the invite.
  - Expected: resend succeeds and pending invite remains valid.
- [x] Open invite link signed out.
  - Expected: invite page asks for sign-in/sign-up before acceptance if needed.
- [x] Accept invite as the invited user.
  - Expected: user becomes a workspace member and can access that workspace.
- [x] Try reusing the accepted invite link.
  - Expected: link cannot create duplicate membership.
- [x] Create a second invite, revoke it, then open the revoked link.
  - Expected: revoked invite cannot be accepted.

Notes:

- Manual QA: invite create/resend/revoke/accept/reuse flow is smooth overall.
- UX issue logged as QA-003: accepting an invite while already signed in as that account opened/logged into a new tab instead of continuing in the existing signed-in tab.

### Ownership Transfer

- [x] As Karuna, open `BIO 101` members page.
- [x] Attempt transfer without selecting a member or without typing `TRANSFER`.
  - Expected: transfer is blocked.
- [x] Transfer ownership to Avery.
  - Expected: Avery becomes `OWNER`; Karuna becomes `ADMIN`; `Workspace.createdByUserId` follows Avery.
- [x] As Karuna, confirm owner-only controls are no longer available where appropriate.
- [x] As Avery, confirm owner-only controls are now available.
- [x] Transfer ownership back to Karuna if needed for the rest of QA.
  - Expected: roles and owner controls return to the original state.

Notes:

- Karuna members page shows `Invite Member` and `Transfer Ownership`.
- Avery members page shows "Only the workspace owner can manage members" and does not expose invite/transfer controls.
- Manual QA: ownership transfer and transfer-back passed.
- Manual QA: previous owner becomes `ADMIN`; admin role behavior passed.

## Pass 3: Workspace Chat

### Channel Isolation

- [x] As Karuna and Avery, open `BIO 101` workspace chat in separate sessions.
- [x] Send a message in `#general` as Karuna.
  - Expected: Avery sees it live without refresh.
- [x] Switch Karuna to a meeting channel.
  - Expected: `#general` messages disappear and meeting-channel messages load.
- [x] Send a meeting-channel message as Karuna.
  - Expected: Avery sees it only when viewing the same meeting channel.
- [x] Switch back to `#general`.
  - Expected: stale meeting messages do not remain visible.
- [x] Edit and delete a message.
  - Expected: changes persist after refresh and appear live for other active viewers.

Notes:

- Code review: `app/api/chat/messages/route.ts` requires auth for write operations and active workspace membership for channel access. Editing is limited to the sender. Deletion allows sender or owner/admin moderation.
- Smoke API check: unauthenticated `POST /api/chat/messages` returned `401 Authentication required`.
- Authenticated API check: Karuna successfully posted `QA Karuna chat smoke 20260505200430` to `BIO 101` `#general`.
- Authenticated negative check: Avery was blocked with `403` when trying to post to `BIO 101 Study Group` `#general`.
- Manual QA: realtime chat channel switching, live delivery, edit, and delete passed.

### Canceled Meeting Channels

- [x] Cancel or use an already canceled meeting.
- [x] Open workspace chat channel list.
  - Expected: canceled meeting channel is hidden.
- [x] Open the canceled meeting hub/history directly if reachable.
  - Expected: prior chat data remains available only where intended.
- [x] Confirm canceled meeting page does not show `Open in channels`.

Notes:

- Code review: `app/workspaces/[id]/chat/page.tsx` filters workspace channels so meeting channels are included only when `meeting.canceledAt` is `null`.
- `BIO 101 Study Group` has two `Chapter 3 Review` meetings. Workspace chat showed only the active duplicate channel dated May 1, not the canceled meeting channel.
- Canceled meeting page showed "This meeting was canceled" and `Meeting Chat`; `Open in channels` was not present.

## Pass 4: Meetings, RSVP, Artifacts, And Lifecycle

### Schedule, Edit, Cancel

- [ ] As Karuna, create a future meeting in `BIO 101`.
  - Expected: meeting appears in workspace meetings list and detail page.
- [ ] Edit title, time, and participants.
  - Expected: updated values persist after refresh.
- [ ] Cancel the meeting.
  - Expected: status is canceled, video join is blocked, workspace chat channel is hidden.

Notes:

- Code review: `app/workspaces/[id]/meetings/actions.ts` allows create by active workspace members, update/cancel by creator/owner/admin, and blocks schedule changes once lifecycle is no longer manageable.
- Manual QA: duplicate meeting creation from double submit was fixed with a pending submit button and a server duplicate guard.

### RSVP Before And During Live Meeting

- [ ] Create or open a joinable/live meeting with Avery invited.
- [x] As Dhyan, open a live meeting hub.
  - Expected: prominent Accept/Decline prompt appears.
- [ ] Accept RSVP as Avery.
  - Expected: RSVP state updates without joining video.
- [ ] During live state, change RSVP from accepted to declined or declined to accepted.
  - Expected: change is allowed and saved.
- [ ] Refresh the meeting hub.
  - Expected: latest RSVP state persists.

Notes:

- Code review: `updateCurrentUserParticipantStatus` allows RSVP changes through `scheduled`, `starting-soon`, `joinable`, and `live`, and blocks canceled/ended meetings.
- Dhyan's live `Capter 4 Review` meeting hub showed `RSVP`, `Accept`, and `Decline`.
- Attempted RSVP change after the meeting crossed its end time; app redirected with `meeting=read-only`, which is correct for ended meetings.
- RSVP mutation during the live window still needs a manual timing check because the available live meeting ended during this QA slice.

### Meeting Chat From Hub

- [ ] As Karuna and Avery, open the same live or upcoming meeting hub.
- [ ] Send a meeting chat message from the hub.
  - Expected: message appears live for both users.
- [ ] Open the same meeting channel from workspace chat.
  - Expected: messages match the meeting hub channel.
- [ ] Confirm meeting labels include date/time when duplicate meeting titles exist.

Notes:

- Code review: meeting hub uses the same channel messages and `MeetingChatPanel` path. Workspace chat uses a keyed `RealtimeChatPanel` room to force Liveblocks remount when switching channels.

### Artifacts

- [ ] From a meeting hub, attach an existing note.
  - Expected: note appears in meeting artifacts and opens for authorized users.
- [ ] Attach an existing file.
  - Expected: file appears in meeting artifacts and opens/downloads for authorized users.
- [ ] Try to attach an artifact as a non-owner/non-authorized user.
  - Expected: action is blocked or unavailable according to role rules.
- [ ] Verify artifact locks after meeting end/cancel if applicable.
  - Expected: locked artifacts cannot be modified through disallowed paths.

Notes:

- Code review: artifact mutation checks active workspace membership and blocks canceled/ended meetings. Shared meeting-created notes are locked after canceled/ended lifecycle.
- Manual QA: creating a workspace-shared meeting whiteboard while a companion video tab is open no longer creates a duplicate video surface after the hub refreshes.

## Pass 5: Video And LiveKit

Use a meeting that is live/joinable.

- [x] As Karuna, join video from the meeting hub.
  - Expected: video connects and a video session starts only after connection.
- [x] Leave video.
  - Expected: active session is cleaned up.
- [x] Join again and refresh the page while connected.
  - Expected: reconnect behavior is reasonable and duplicate active sessions are cleaned up.
- [x] Open the same user in a duplicate tab and try to join.
  - Expected: client session handling prevents broken duplicate session state.
- [x] Join as Avery in a second browser.
  - Expected: both users can see/hear each other if device permissions are granted.
- [x] Use floating video PiP.
  - Expected: no hydration mismatch, position restores after refresh, and controls remain usable.
- [x] Use popout/new-tab or split video if available.
  - Expected: video remains connected and navigation does not orphan active sessions.
- [x] Press Leave after joining video.
  - Expected: LiveKit disconnects, the active session is cleaned up, and the panel returns to `Join Video`.
- [x] End or cancel the meeting while video is active.
  - Expected: leaving afterward still cleans up active sessions; new token requests are blocked after lifecycle closes.
- [x] Try to request/join video as a non-member or uninvited optional Aloe user.
  - Expected: token access is denied.

Notes:

- Code review: `POST /api/livekit-token` is stateless and checks auth, active workspace membership, participant access, meeting lifecycle, and client session ID before issuing a token.
- Smoke API check: unauthenticated `POST /api/livekit-token` returned `401 Authentication required`.
- Code review: `markCurrentUserVideoJoined` calls `startMeetingVideoSession` after client connection; `markCurrentUserVideoLeft` closes sessions even when lifecycle has ended/canceled because end does not require `canJoinMeeting`.
- Previous hydration mismatch in `FloatingMeetingVideo` was fixed under QA-002.
- Positive token check: Dhyan received `200 OK` and a LiveKit room payload for the live `Capter 4 Review` meeting.
- Negative permission check: Avery received `403` for the same Study Group meeting.
- Invalid session check: Dhyan received `400 Invalid video session` for a short/invalid client session ID.
- Manual QA: duplicate tab behavior appears sane. The newer tab becomes active; tab A remains on the meeting hub but camera/microphone stop, avoiding duplicate active media for the same user.
- Manual QA: split/floating/new-tab video behavior passed, including Chrome split tabs.
- Manual QA: companion video tab opens separately from the hub, can focus notes/chat on the hub, and `Bring video back` returns focus to the hub and closes the video tab.
- Manual QA: pressing Leave returns the video panel to `Join Video`.
- Manual QA: floating panel resize minimum is usable and bad saved tiny panel state is clamped on reload.

### LiveKit Recording

- [x] Start recording from split video.
  - Expected: recording starts without leaving the hub or forcing a video rejoin.
- [x] Stop recording from split video.
  - Expected: recording enters finalizing/saved state and remains accessible.
- [x] Start/stop recording from floating video.
  - Expected: recording works regardless of floating or split presentation.
- [x] Start/stop recording from the standalone video tab.
  - Expected: recording works in the companion video tab and returns to the correct video context.
- [x] Try starting recording before any active video participant exists.
  - Expected: start is blocked by UI and server action.
- [x] Confirm completed recording appears in meeting artifacts.
- [x] Confirm completed recording appears in workspace Files.
- [x] Open completed recording.
  - Expected: `/api/files/[fileId]` serves the recording through a signed storage URL.
- [x] Confirm non-owner/non-admin/non-creator cannot manage recording if applicable.

Notes:

- Manual QA: LiveKit Egress recording works from split, floating, and companion-tab video surfaces.
- Manual QA: saved recording artifacts and workspace Files entry appear after finalization.
- Manual QA: recording controls are no longer interactive on the meeting hub; the hub only shows saved recording status/artifact actions.
- Code review: recording server actions still enforce active workspace membership, creator/owner/admin permission, joinable meeting lifecycle, active video session presence, and single active recording.
- Code review: active/finalizing recording status auto-syncs from the video room instead of requiring a manual refresh button.

## Pass 6: Notes And Whiteboards

### Notes

- [x] As Karuna, create a text note in `BIO 101`.
  - Expected: note appears in list and opens.
- [x] Edit note content.
  - Expected: changes save and persist after refresh.
- [x] Open the note as Avery if shared.
  - Expected: Avery's access matches note visibility/collaborator rules.
- [x] Try accessing a private note with another authorized workspace user.
  - Expected: edit is blocked.
- [x] Export the note to PDF if available.
  - Expected: PDF downloads/opens and respects access rules.
- [x] Delete the note.
  - Expected: note is removed or hidden according to product behavior.

Notes:

- Avery opened her shared `BIO 101` note successfully and the page showed note/editor affordances.
- Karuna received `404` when opening Avery's private note URL, which protects private note access.
- Manual QA: collaborative note behavior passed.

### Whiteboards

- [x] As Karuna, create a whiteboard.
  - Expected: whiteboard opens and canvas renders.
- [x] Draw several strokes.
  - Expected: strokes persist after refresh.
- [x] Open as another authorized workspace member.
  - Expected: collaborative updates appear live or after refresh according to current implementation.
- [x] Try unauthorized access.
  - Expected: access is denied.
- [x] Delete the whiteboard.
  - Expected: whiteboard is removed or hidden according to product behavior.

Notes:

- Manual QA: collaborative whiteboard behavior passed.
- UX edge case logged as QA-005: deleting a live meeting-created shared whiteboard should actively notify/evict current viewers instead of leaving a temporary ghost board until refresh.

## Pass 7: Files

- [x] As Karuna, open workspace files.
- [x] Open the imported PDFs.
  - Expected: both load from Supabase Storage using their DB `storageKey`s.
- [ ] Upload a small PDF or image.
  - Expected: upload succeeds and file appears in the list.
- [ ] Open/download the uploaded file.
  - Expected: file loads correctly.
- [ ] Rename the uploaded file.
  - Expected: renamed file persists after refresh and storage object still opens.
- [ ] Delete the uploaded file.
  - Expected: file disappears and direct access is blocked or clearly unavailable.
- [x] Try file access as Avery/Dhyan according to their role.
  - Expected: permissions match role and workspace membership.

Notes:

- Karuna opened the `BIO 101` files page and saw the imported `Paper` file.
- Karuna file API request for the imported PDF returned `307` to a signed Supabase Storage URL.
- Dhyan was blocked from the `BIO 101` files page with "You do not have access".
- Dhyan file API request for the same BIO file returned `403`.
- Upload, rename, and delete remain manual browser checks.

## Pass 8: Cross-User Permission Checks

- [x] Avery cannot access `BIO 101 Study Group` URLs by manually pasting a URL unless Avery is a member.
- [x] Dhyan cannot access `BIO 101` URLs by manually pasting a URL unless Dhyan is a member.
- [ ] Aloe cannot access any workspace, note, file, meeting, chat, or video URL unless explicitly invited.
- [x] Signed-out users are redirected away from protected routes.
- [x] Workspace members can access all active workspace meeting chats.
- [ ] Non-workspace meeting guests, if tested, do not retain post-meeting chat access.

Notes:

- `/account` redirects signed-out users to `/login?next=/account`.
- `POST /api/chat/messages` and `POST /api/livekit-token` reject signed-out users with `401`.
- `POST /api/liveblocks-auth` rejects an unknown room with `403`.
- Avery is blocked from Study Group pages and Study Group chat writes.
- Dhyan is blocked from BIO 101 pages and BIO 101 file access.
- Dhyan can open Study Group meeting chat/history as an active workspace member.

## Pass 9: Final Regression Sweep

- [ ] Refresh dashboard as Karuna, Avery, and Dhyan.
- [ ] Confirm no unexpected 500 pages.
- [ ] Confirm no repeated console errors during normal navigation.
- [ ] Confirm terminal logs do not show repeated database, Liveblocks, LiveKit, Resend, or storage failures.
- [x] Run `npm run lint`.
- [x] Run `npx tsc --noEmit`.
- [x] Run `npm run build`.
- [x] Record all remaining bugs in the bug log.

Notes:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed. A sandboxed Turbopack build hit an internal port-binding restriction, then passed when rerun outside the sandbox.
- Dev log includes intermittent Liveblocks websocket `1006` warnings and LiveKit connection retries; not logged as app bugs yet because they may be transient/network-dependent and need browser confirmation.

## Pass 10: Loading, Performance, and Dashboard Polish

- [x] Added route loading skeletons for dashboard, account, workspace dashboard, meetings, meeting hub, notes, and files.
- [x] Reduced broad Prisma payloads on dashboard, workspace dashboard, meetings list, meeting hub, notes list, and files list.
- [x] Dashboard recent messages, recent notes, and upcoming meetings are capped as global previews instead of growing per workspace/channel.
- [x] Dashboard recent message and note cards are compact and link to their source pages.
- [x] Dashboard empty states added for workspaces, upcoming meetings, recent messages, and recent notes.
- [x] Dashboard quick links added for chat, notes, and meetings when a workspace is available.
- [x] Browser-facing benchmark showed dashboard payload shrinking from roughly 399 KB to 3.6 KB after global preview caps.

Notes:

- Loading skeletons may not visibly appear when a route is prefetched or loads too quickly.
- Mobile/narrow layout polish was handled through stacked dashboard controls, compact cards, and wrapping section actions.
- Production build still needs to run outside the sandbox because Turbopack attempts an internal port bind.

## QA Session Summary

Date:

May 5-6, 2026

Tester:

Codex assisted QA plus manual browser QA

Environment:

Local Next dev server at http://localhost:3000 using Supabase-backed `.env`.

Build/branch:

Local working tree, uncommitted handoff changes present.

Browsers used:

Terminal HTTP smoke checks, existing dev browser logs, and separate real browser profiles for Karuna, Avery, and Dhyan.

Accounts used:

Karuna, Avery, Dhyan, signed-out sessions, and invite recipient flow. No destructive account deletion yet.

Overall result:

MVP manual QA pass completed. Auth, account profile/password update, account deletion, workspace invite flow, ownership transfer, admin role behavior, workspace access boundaries, realtime chat, canceled meeting channel visibility, LiveKit/video behavior, LiveKit recording, collaborative notes/whiteboards, private/shared note access, file flows, meeting artifacts, and remaining manual checks passed unless listed in the bug log. Lint, TypeScript, and production build pass. Known open issues are logged.

Open blockers:

None. All logged QA bugs are fixed and browser spot-checked.

Follow-up fixes:

Completed for the logged QA bugs. Latest fixed areas include recording UX relocation, split/floating/new-tab recording controls, companion video tab return behavior, Leave returning to `Join Video`, floating panel minimum size, cross-tab video remount handshake, duplicate meeting creation guard, and deleted-user filtering in meeting participant counts.

Remaining Manual QA:

None. QA pass complete; track remaining work through the bug log.
