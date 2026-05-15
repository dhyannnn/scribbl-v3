# Scribbl Next Steps

The MVP database is created and seeded with sample data.

## Current Status

- PostgreSQL is running through Postgres.app.
- The local database is named `scribbl`.
- Prisma migrations have created the tables.
- `prisma/seed.sql` adds sample development data.
- Prisma Studio can show the schema and records.

## Useful Commands

Format and validate the Prisma schema:

```bash
npx prisma format
npx prisma validate
```

Apply future schema changes:

```bash
npx prisma migrate dev --name describe_the_change
```

Open Prisma Studio:

```bash
npx prisma studio
```

Seed local sample data:

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -h localhost -p 5432 -U Karuna -d scribbl -f prisma/seed.sql
```

## Recommended Build Order

1. Build the app shell with Next.js.
2. Add a dashboard that lists workspaces.
3. Add a workspace page for BIO 101.
4. Show workspace channels and messages.
5. Show workspace notes.
6. Add create/read/update forms for workspaces, messages, and notes.
7. Add meetings and calendar views.
8. Add realtime collaboration after the normal CRUD flow works.

## First App Screen

The first useful screen should be the dashboard:

- show the current user
- list the user's workspaces
- show recent notes
- show upcoming meetings

That screen will prove the main database relationships are shaped correctly.

## Current MVP Polish Priority

1. Responsive/mobile pass for the dashboard and workspace shell.
2. Responsive/mobile pass for chat.
3. Responsive/mobile pass for meeting detail pages.
4. Responsive/mobile pass for notes and whiteboards.
5. Front-end visual redesign/design-system pass once the core layouts behave across screen sizes.
6. Hardening tests for notifications, announcements, chat notifications, meetings, and cleanup behavior.
7. Production prep: scheduled notification cleanup, rate limits, logger wiring, audit coverage, and deployment environment review.
