# Scribbl

A collaborative workspace app for students and educators. Supports real-time notes, whiteboards, meetings with video, file sharing, and chat — organized into workspaces (courses, study groups, tutoring groups).

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js (App Router, server actions) |
| Database | PostgreSQL via Prisma |
| Auth + Storage | Supabase |
| Real-time collaboration | Liveblocks (notes, whiteboards, chat events) |
| Video meetings | LiveKit |
| Email | Resend |
| Styling | Tailwind CSS |

## Project Structure

```
app/
  page.tsx                          # Landing / dashboard
  login/                            # Auth (Supabase)
  auth/                             # OAuth callback
  invites/[token]/                  # Workspace invite acceptance
  workspaces/[id]/                  # Workspace home
    chat/                           # Workspace-level chat channels
    notes/[noteId]/                 # Text notes + whiteboards (Liveblocks)
    files/                          # File upload/download
    members/                        # Member list
    meetings/
      [meetingId]/                  # Meeting detail page
        video/                      # LiveKit video room

components/
  RealtimeChatPanel.tsx             # Reusable real-time chat (Liveblocks broadcast events + DB persistence)
  TextNoteEditor.tsx                # Rich text note editor
  WhiteboardEditor.tsx              # Whiteboard editor
  LiveblocksRoom.tsx                # Liveblocks room wrapper
  PresenceBar.tsx                   # Shows who's online in a room

lib/
  prisma.ts                         # Prisma client
  current-user.ts                   # Get authenticated user from Supabase session
  meeting-lifecycle.ts              # Meeting state machine (upcoming, live, ended, cancelled)
  liveblocks-room.ts                # Liveblocks server auth helper
  livekit-room.ts                   # LiveKit token generation
  supabase/                         # Supabase client, server, admin, proxy
  email/                            # Resend email templates (invites, meeting notifications)
  pdf/                              # Note PDF export

prisma/
  schema.prisma                     # Full DB schema
  migrations/                       # All applied migrations
  seed.sql                          # Sample dev data
```

## Database Models

- **User** — synced from Supabase auth
- **Workspace** — course, study group, or tutoring group
- **WorkspaceMember** — roles: OWNER, ADMIN, MEMBER, TUTOR, PROFESSOR
- **WorkspaceInvite** — token-based email invites
- **Channel** — chat channels per workspace or per meeting
- **Message** — chat messages with soft delete + edit tracking
- **Note** — text notes or whiteboards, with visibility + collaboration mode settings
- **NoteCollaborator** — per-user note permissions (VIEW, COMMENT, EDIT)
- **File** — uploaded files stored in Supabase Storage
- **Meeting** — scheduled meetings with cancellation metadata
- **MeetingParticipant** — RSVP + attendance tracking (INVITED, ACCEPTED, DECLINED)
- **MeetingVideoSession** — LiveKit session tracking per user per meeting
- **MeetingArtifact** — notes, files, recordings attached to a meeting

## What's Been Built

- Supabase auth (email/password + OAuth callback)
- Workspace creation and management
- Workspace invite flow (token email → accept page → membership)
- Member roles and permissions
- Notes (text + whiteboard) with Liveblocks real-time collaboration
- Note visibility (private vs workspace-shared) and export access controls
- Note PDF export
- File upload/download with Supabase Storage
- Meetings — create, cancel, RSVP, view participants
- LiveKit video rooms embedded in meeting pages
- Meeting artifacts (attach notes/files to meetings)
- Chat channels per workspace and per meeting
- **Real-time chat using Liveblocks broadcast events + Postgres persistence** ← currently in progress

## Real-Time Chat Architecture

Chat is implemented in `components/RealtimeChatPanel.tsx`:

- Messages are **persisted to Postgres** via server actions in `app/api/chat/messages/route.ts`
- **Real-time delivery** uses Liveblocks broadcast events (`useBroadcastEvent` / `useEventListener`) so all users in the same Liveblocks room see new/edited/deleted messages instantly without polling
- Each channel is tied to a Liveblocks room (workspace room or meeting room)
- Optimistic UI: messages appear immediately for the sender while the server action runs
- Supports message edit and soft delete

## Current Focus

Real-time chat is the active development area. The `RealtimeChatPanel` component is reused for both workspace chat (`app/workspaces/[id]/chat/`) and meeting chat (`app/workspaces/[id]/meetings/[meetingId]/`).

## Setup

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Add a `.env` file — get it from the project owner. It needs:
   - `DATABASE_URL` — Supabase Postgres connection string
   - `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY`
   - `LIVEBLOCKS_SECRET_KEY`
   - `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET`
   - `RESEND_API_KEY` + `EMAIL_FROM`
   - `APP_URL` — e.g. `http://localhost:3000`
   - Supabase S3 keys for recordings storage

4. Apply database migrations:
   ```bash
   npx prisma migrate deploy
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Useful Commands

```bash
npx prisma migrate dev --name describe_your_change   # create + apply a new migration
npx prisma studio                                    # visual DB browser
npx prisma format                                    # format schema.prisma
```
