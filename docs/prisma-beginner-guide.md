# Prisma Beginner Guide For Scribbl

Prisma is a database toolkit. Instead of writing every table by hand in SQL, you describe your database in `prisma/schema.prisma`.

Prisma can then:

- create SQL migration files
- apply those migrations to PostgreSQL
- generate a TypeScript client for reading and writing database records

The schema file is still describing normal database tables. For example:

```prisma
model User {
  id          String @id @default(uuid()) @db.Uuid
  email       String @unique
  displayName String
}
```

means roughly:

```sql
create table users_or_user (
  id uuid primary key,
  email text unique not null,
  display_name text not null
);
```

Prisma uses model names like `User`, `Workspace`, and `Message`. PostgreSQL stores the actual data.

## Files Added

- `prisma/schema.prisma`: the first Scribbl database schema
- `prisma.config.ts`: Prisma 7 configuration, including where the schema and migrations live
- `.env.example`: a template for the database connection string
- `.env`: your local database connection string, not meant to be committed to Git

## Main Concepts

### Model

A Prisma `model` becomes a database table.

Examples:

- `User`
- `Workspace`
- `Message`
- `Note`
- `Meeting`

### Field

A field becomes a column in the table.

Example:

```prisma
email String @unique
```

This means every user has an email, and no two users can have the same email.

### Relation

A relation connects one table to another.

Example:

```prisma
createdByUserId String @db.Uuid
createdBy       User   @relation(fields: [createdByUserId], references: [id])
```

This means a workspace stores the ID of the user who created it.

### Enum

An enum limits a field to a fixed set of values.

Example:

```prisma
enum WorkspaceType {
  COURSE
  STUDY_GROUP
  TUTORING_GROUP
}
```

This keeps workspace types consistent.

## How The MVP Schema Works

The most important chain is:

```txt
User
  -> WorkspaceMember
  -> Workspace
  -> Channel
  -> Message
```

That means:

1. A user joins a workspace through `WorkspaceMember`.
2. A workspace can have channels.
3. Channels contain messages.

Notes, files, and meetings also attach to workspaces:

```txt
Workspace
  -> Note
  -> File
  -> Meeting
```

This lets one course workspace contain chat, notes, PDFs, uploads, and scheduled sessions.

## Commands You Will Eventually Use

After a Node.js app is created and dependencies are installed, these are the common Prisma commands:

```bash
npx prisma format
```

Formats `schema.prisma`.

```bash
npx prisma validate
```

Checks whether the schema is valid.

```bash
npx prisma migrate dev --name init
```

Creates the first SQL migration and applies it to your local database.

```bash
npx prisma studio
```

Opens a local browser UI where you can view and edit database records.

## Recommended Next Step

Set up a real local PostgreSQL database, update `.env` with the real connection string, and run the first migration.

Until then, `prisma/schema.prisma` is the source of truth for the planned database structure.

## Current Project Status

Prisma is installed and the schema is valid.

These commands should work:

```bash
npx prisma format
npx prisma validate
```

The next command, shown below, should wait until PostgreSQL is installed and `.env` has a real connection string:

```bash
npx prisma migrate dev --name init
```
