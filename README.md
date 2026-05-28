# Scribbl

A collaborative workspace app for students and educators. Supports real-time notes, whiteboards, meetings with video, file sharing, and chat — organized into workspaces (courses, study groups, tutoring groups).

## Tech Stack

| Layer | Tool |
|---|---|
| Web | Next.js (App Router, server actions) |
| Mobile | Expo + React Native |
| Database | PostgreSQL via Prisma |
| Auth + Storage | Supabase |
| Real-time collaboration | Liveblocks (notes, whiteboards, chat events) |
| Video meetings | LiveKit |
| Email | Resend |
| Styling | Tailwind CSS |

## Project Structure

```
apps/
  web/
    app/                            # Next.js routes and API handlers
    components/                     # Web UI components
    lib/                            # Web server/client helpers
    tests/                          # Web unit tests
  mobile/
    app/                            # Expo Router screens
    components/                     # Mobile UI components
    lib/                            # Supabase session + mobile API client

packages/
  shared/                           # Shared DTOs and runtime-safe helpers

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
- Expo mobile app for read-heavy core flows: login, workspaces/sessions, notes, chat, meetings
- Mobile bearer-token API under `apps/web/app/api/mobile`
- **Real-time chat using Liveblocks broadcast events + Postgres persistence** ← currently in progress

## Real-Time Chat Architecture

Chat is implemented in `apps/web/components/RealtimeChatPanel.tsx`:

- Messages are **persisted to Postgres** via server actions in `apps/web/app/api/chat/messages/route.ts`
- **Real-time delivery** uses Liveblocks broadcast events (`useBroadcastEvent` / `useEventListener`) so all users in the same Liveblocks room see new/edited/deleted messages instantly without polling
- Each channel is tied to a Liveblocks room (workspace room or meeting room)
- Optimistic UI: messages appear immediately for the sender while the server action runs
- Supports message edit and soft delete

## Current Focus

Mobile is now scaffolded as a companion app. The first native surface is read-heavy and opens the web app for rich note editing, whiteboards, video, and recording-heavy meeting flows.

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
   npm run dev:web
   ```

Open [http://localhost:3000](http://localhost:3000).

6. Run the mobile app:
   ```bash
   npm run start:mobile
   ```

The Expo app reads Supabase and API settings from the root `.env` through `apps/mobile/app.config.js`. Override with `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when testing on a physical device.

## Useful Commands

```bash
npm run dev:web                                    # Next.js web app
npm run start:mobile                              # Expo mobile app
npm run typecheck                                 # web + mobile type checks
npm run lint                                      # web + mobile lint
npm test                                          # web unit tests
npx prisma migrate dev --name describe_your_change   # create + apply a new migration
npx prisma studio                                    # visual DB browser
npx prisma format                                    # format schema.prisma
```
