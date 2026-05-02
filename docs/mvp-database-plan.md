# Scribbl MVP Database Plan

Scribbl is a collaborative note-taking and study workspace for university students and tutoring centers. The long-term product can grow toward LMS-style course management, but the MVP should prove the core loop first:

> A student joins or creates a workspace, chats with peers, collaborates on notes or a whiteboard, schedules study sessions, and finds saved materials later.

## MVP Scope

Build the first version around these workflows:

1. A user signs up and manages their profile.
2. A user creates or joins a workspace.
3. A workspace can represent a course, private study group, or tutoring group.
4. Members can send chat messages inside workspace channels.
5. Members can create notes and whiteboards inside a workspace.
6. Notes and whiteboards can be shared with other members.
7. Members can schedule meetings or tutoring sessions.
8. Meeting outputs can be saved as notes, whiteboards, PDFs, recordings, or files.

## Not In The First MVP

These features are important later, but should not shape the first schema too heavily:

- Assignment submissions
- Gradebook
- Rubrics
- University registrar integrations
- Institution-wide course enrollment sync
- Professor-only admin dashboards
- Deep calendar integrations
- Full video recording infrastructure
- AI summaries and transcription
- Billing

## Core Entities

The first schema should center on a generic `workspaces` table instead of separate `courses`, `study_groups`, and `tutoring_centers` tables. Those concepts behave differently from a product perspective, but they all share the same technical pattern: people, chat, notes, files, meetings, and saved history.

```txt
users
  -> workspace_members
  -> workspaces
       -> channels
            -> messages
       -> notes
            -> note_collaborators
       -> files
       -> meetings
            -> meeting_participants
            -> meeting_artifacts
```

## Tables

### users

Stores student, tutor, professor, and admin accounts.

```txt
users
- id                    uuid primary key
- email                 text unique not null
- display_name          text not null
- avatar_url            text nullable
- created_at            timestamp not null
- updated_at            timestamp not null
```

Notes:

- Keep auth-provider fields flexible. If using Clerk, Supabase Auth, or Auth.js, add an external auth ID later.
- Avoid splitting students, tutors, and professors into separate tables at first. Use roles inside memberships.

### workspaces

Represents a course, private study group, or tutoring center group.

```txt
workspaces
- id                    uuid primary key
- name                  text not null
- type                  text not null       // course, study_group, tutoring_group
- description           text nullable
- created_by_user_id    uuid references users(id)
- created_at            timestamp not null
- updated_at            timestamp not null
```

Notes:

- A course like "BIO 101" and a private group like "Midterm Study Squad" can both be workspaces.
- Later, `workspaces` can point to institutions, terms, and official course sections.

### workspace_members

Connects users to workspaces and defines their role inside that space.

```txt
workspace_members
- id                    uuid primary key
- workspace_id          uuid references workspaces(id)
- user_id               uuid references users(id)
- role                  text not null       // owner, admin, member, tutor, professor
- status                text not null       // active, invited, removed
- joined_at             timestamp nullable
- created_at            timestamp not null

unique(workspace_id, user_id)
```

Notes:

- Most permissions should start from membership role.
- A user can be a tutor in one workspace and a student/member in another.

### channels

Stores chat channels inside a workspace.

```txt
channels
- id                    uuid primary key
- workspace_id          uuid references workspaces(id)
- name                  text not null
- type                  text not null       // chat, announcement
- created_by_user_id    uuid references users(id)
- created_at            timestamp not null
- updated_at            timestamp not null
```

Notes:

- Every workspace should get a default `general` channel.
- Announcements can be modeled as channels now and refined later.

### messages

Stores chat messages.

```txt
messages
- id                    uuid primary key
- channel_id            uuid references channels(id)
- sender_user_id        uuid references users(id)
- body                  text not null
- created_at            timestamp not null
- edited_at             timestamp nullable
- deleted_at            timestamp nullable
```

Notes:

- Soft delete keeps conversation history consistent.
- File attachments can be added later through a `message_attachments` table if needed.

### notes

Stores personal, shared, text, and whiteboard notes.

```txt
notes
- id                    uuid primary key
- workspace_id          uuid references workspaces(id) nullable
- owner_user_id         uuid references users(id)
- title                 text not null
- type                  text not null       // text, whiteboard
- storage_type          text not null       // json, file
- content_json          jsonb nullable
- content_file_id       uuid references files(id) nullable
- created_at            timestamp not null
- updated_at            timestamp not null
- deleted_at            timestamp nullable
```

Notes:

- `workspace_id` is nullable so users can also have private personal notes.
- Text notes may use JSON from a rich-text editor.
- Whiteboards may use JSON from a canvas/collaboration engine, or a saved file reference.

### note_collaborators

Defines explicit note-level sharing permissions.

```txt
note_collaborators
- id                    uuid primary key
- note_id               uuid references notes(id)
- user_id               uuid references users(id)
- permission            text not null       // view, comment, edit
- created_at            timestamp not null

unique(note_id, user_id)
```

Notes:

- Workspace members can have default access, but this table supports private/shared exceptions.
- Later, this can support group-level permissions.

### files

Stores uploaded files and generated outputs such as PDFs.

```txt
files
- id                    uuid primary key
- workspace_id          uuid references workspaces(id) nullable
- uploaded_by_user_id   uuid references users(id)
- name                  text not null
- mime_type             text not null
- size_bytes            integer nullable
- storage_key           text not null
- public_url            text nullable
- created_at            timestamp not null
```

Notes:

- `storage_key` should point to object storage, such as S3 or Supabase Storage.
- `workspace_id` is nullable for private files.

### meetings

Stores scheduled calls, tutoring sessions, online classes, and study sessions.

```txt
meetings
- id                    uuid primary key
- workspace_id          uuid references workspaces(id) nullable
- title                 text not null
- description           text nullable
- starts_at             timestamp not null
- ends_at               timestamp nullable
- provider              text nullable       // livekit, daily, agora, zoom
- provider_meeting_id   text nullable
- meeting_url           text nullable
- created_by_user_id    uuid references users(id)
- created_at            timestamp not null
- updated_at            timestamp not null
```

Notes:

- `workspace_id` is nullable so users can schedule private sessions.
- Use a video provider first instead of building video infrastructure from scratch.

### meeting_participants

Tracks invitees and attendance.

```txt
meeting_participants
- id                    uuid primary key
- meeting_id            uuid references meetings(id)
- user_id               uuid references users(id)
- status                text not null       // invited, accepted, declined, joined, missed
- joined_at             timestamp nullable
- left_at               timestamp nullable
- created_at            timestamp not null

unique(meeting_id, user_id)
```

### meeting_artifacts

Links saved meeting outputs to notes or files.

```txt
meeting_artifacts
- id                    uuid primary key
- meeting_id            uuid references meetings(id)
- type                  text not null       // note, whiteboard, pdf, recording, file
- note_id               uuid references notes(id) nullable
- file_id               uuid references files(id) nullable
- created_by_user_id    uuid references users(id)
- created_at            timestamp not null
```

Notes:

- Use this for "past calls" where students can find notes they did not save locally.
- A meeting artifact should usually point to either `note_id` or `file_id`.

## Suggested MVP Screens

### Dashboard

Data needed:

- current user
- workspaces where the user is an active member
- upcoming meetings where the user is a participant
- recently updated notes

### Workspace Detail

Data needed:

- workspace details
- workspace members
- channels
- recent messages
- notes in this workspace
- files in this workspace
- upcoming meetings in this workspace

### Chat

Data needed:

- channel
- messages in channel
- sender profile for each message
- current user's membership and permissions

### Notes

Data needed:

- note metadata
- note content
- collaborators
- related workspace
- generated PDF file if exported

### Meetings

Data needed:

- meeting metadata
- participants
- meeting provider URL
- saved artifacts after the call

## Later LMS Tables

Add these only when Scribbl intentionally moves into course management:

```txt
institutions
terms
course_sections
official_enrollments
announcements
assignments
submissions
grades
rubrics
modules
module_items
```

At that point, `workspaces` can either reference official course sections or continue acting as the collaboration layer attached to them.

## Build Order

1. Auth and users
2. Workspaces and memberships
3. Workspace dashboard
4. Channels and messages
5. Notes and basic rich-text editor
6. Whiteboard documents
7. File storage and PDF export
8. Meetings and participants
9. Meeting artifacts and past sessions

## First Technical Recommendation

Use PostgreSQL with an ORM such as Prisma or Drizzle. PostgreSQL gives you relational integrity for memberships, messages, meetings, and files, while `jsonb` gives enough flexibility for early note and whiteboard document formats.

For realtime collaboration, use a proven collaboration layer such as Yjs, Liveblocks, or a similar provider instead of designing custom conflict resolution in the database.
