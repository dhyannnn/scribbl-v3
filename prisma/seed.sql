-- Sample data for local development.
-- Run this after migrations to make Prisma Studio easier to explore.

delete from "MeetingArtifact";
delete from "MeetingParticipant";
delete from "Meeting";
delete from "NoteCollaborator";
delete from "Note";
delete from "Message";
delete from "Channel";
delete from "WorkspaceMember";
delete from "File";
delete from "Workspace";
delete from "User";

insert into "User" (
  "id",
  "authUserId",
  "email",
  "firstName",
  "lastName",
  "displayName",
  "role",
  "avatarUrl",
  "createdAt",
  "updatedAt"
) values (
  '00000000-0000-0000-0000-000000000001',
  null,
  'karuna@example.com',
  'Karuna',
  '',
  'Karuna',
  'STUDENT',
  null,
  now(),
  now()
), (
  '00000000-0000-0000-0000-000000000002',
  null,
  'avery@example.com',
  'Avery',
  '',
  'Avery',
  'STUDENT',
  null,
  now(),
  now()
);

insert into "Workspace" (
  "id",
  "name",
  "type",
  "description",
  "createdByUserId",
  "createdAt",
  "updatedAt"
) values (
  '10000000-0000-0000-0000-000000000001',
  'BIO 101',
  'COURSE',
  'Intro biology course workspace for notes, chat, and tutoring sessions.',
  '00000000-0000-0000-0000-000000000001',
  now(),
  now()
);

insert into "WorkspaceMember" (
  "id",
  "workspaceId",
  "userId",
  "role",
  "status",
  "joinedAt",
  "createdAt"
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'OWNER',
  'ACTIVE',
  now(),
  now()
), (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'MEMBER',
  'ACTIVE',
  now(),
  now()
);

insert into "Channel" (
  "id",
  "workspaceId",
  "name",
  "type",
  "createdByUserId",
  "createdAt",
  "updatedAt"
) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'general',
  'CHAT',
  '00000000-0000-0000-0000-000000000001',
  now(),
  now()
);

insert into "Message" (
  "id",
  "channelId",
  "senderUserId",
  "body",
  "createdAt"
) values
(
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Welcome to BIO 101. Drop study questions here.',
  now()
),
(
  '40000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Planning a peer tutoring session for Chapter 1 this week.',
  now()
);

insert into "Note" (
  "id",
  "workspaceId",
  "ownerUserId",
  "title",
  "type",
  "storageType",
  "contentJson",
  "createdAt",
  "updatedAt"
) values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Chapter 1 Cell Structure Notes',
  'TEXT',
  'JSON',
  '{"blocks":[{"type":"heading","text":"Cell Structure"},{"type":"paragraph","text":"Cells are the basic unit of life."}]}',
  now(),
  now()
);

insert into "NoteCollaborator" (
  "id",
  "noteId",
  "userId",
  "permission",
  "createdAt"
) values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'EDIT',
  now()
);

insert into "Meeting" (
  "id",
  "workspaceId",
  "title",
  "description",
  "startsAt",
  "endsAt",
  "provider",
  "providerMeetingId",
  "meetingUrl",
  "createdByUserId",
  "createdAt",
  "updatedAt"
) values (
  '70000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Chapter 1 Peer Tutoring',
  'Review cell structure and prep questions before lecture.',
  now() + interval '2 days',
  now() + interval '2 days 1 hour',
  'demo',
  'demo-bio-101-chapter-1',
  'https://example.com/meet/demo-bio-101-chapter-1',
  '00000000-0000-0000-0000-000000000001',
  now(),
  now()
);

insert into "MeetingParticipant" (
  "id",
  "meetingId",
  "userId",
  "status",
  "createdAt"
) values (
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'ACCEPTED',
  now()
);

insert into "MeetingArtifact" (
  "id",
  "meetingId",
  "type",
  "source",
  "noteId",
  "fileId",
  "createdByUserId",
  "createdAt"
) values (
  '90000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'NOTE',
  'ATTACHED',
  '50000000-0000-0000-0000-000000000001',
  null,
  '00000000-0000-0000-0000-000000000001',
  now()
);
