-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('COURSE', 'STUDY_GROUP', 'TUTORING_GROUP');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'TUTOR', 'PROFESSOR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('CHAT', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('TEXT', 'WHITEBOARD');

-- CreateEnum
CREATE TYPE "NoteStorageType" AS ENUM ('JSON', 'FILE');

-- CreateEnum
CREATE TYPE "NotePermission" AS ENUM ('VIEW', 'COMMENT', 'EDIT');

-- CreateEnum
CREATE TYPE "MeetingParticipantStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'JOINED', 'MISSED');

-- CreateEnum
CREATE TYPE "MeetingArtifactType" AS ENUM ('NOTE', 'WHITEBOARD', 'PDF', 'RECORDING', 'FILE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceType" NOT NULL,
    "description" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL DEFAULT 'CHAT',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "ownerUserId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "storageType" "NoteStorageType" NOT NULL DEFAULT 'JSON',
    "contentJson" JSONB,
    "contentFileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteCollaborator" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "permission" "NotePermission" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "uploadedByUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerMeetingId" TEXT,
    "meetingUrl" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MeetingParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingArtifact" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "type" "MeetingArtifactType" NOT NULL,
    "noteId" UUID,
    "fileId" UUID,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_contentFileId_key" ON "Note"("contentFileId");

-- CreateIndex
CREATE INDEX "Note_workspaceId_idx" ON "Note"("workspaceId");

-- CreateIndex
CREATE INDEX "Note_ownerUserId_idx" ON "Note"("ownerUserId");

-- CreateIndex
CREATE INDEX "NoteCollaborator_userId_idx" ON "NoteCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteCollaborator_noteId_userId_key" ON "NoteCollaborator"("noteId", "userId");

-- CreateIndex
CREATE INDEX "File_workspaceId_idx" ON "File"("workspaceId");

-- CreateIndex
CREATE INDEX "File_uploadedByUserId_idx" ON "File"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "Meeting_workspaceId_startsAt_idx" ON "Meeting"("workspaceId", "startsAt");

-- CreateIndex
CREATE INDEX "Meeting_createdByUserId_idx" ON "Meeting"("createdByUserId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_meetingId_idx" ON "MeetingArtifact"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_noteId_idx" ON "MeetingArtifact"("noteId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_fileId_idx" ON "MeetingArtifact"("fileId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_contentFileId_fkey" FOREIGN KEY ("contentFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteCollaborator" ADD CONSTRAINT "NoteCollaborator_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteCollaborator" ADD CONSTRAINT "NoteCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
