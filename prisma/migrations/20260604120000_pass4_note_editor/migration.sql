-- AlterTable: Note — add page setup, public share, and back-relations
ALTER TABLE "Note"
  ADD COLUMN "orientation"  TEXT    NOT NULL DEFAULT 'portrait',
  ADD COLUMN "marginTop"    DOUBLE PRECISION NOT NULL DEFAULT 72,
  ADD COLUMN "marginBottom" DOUBLE PRECISION NOT NULL DEFAULT 72,
  ADD COLUMN "marginLeft"   DOUBLE PRECISION NOT NULL DEFAULT 72,
  ADD COLUMN "marginRight"  DOUBLE PRECISION NOT NULL DEFAULT 72,
  ADD COLUMN "shareToken"   TEXT    UNIQUE,
  ADD COLUMN "isPublic"     BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex for shareToken
CREATE INDEX "Note_shareToken_idx" ON "Note"("shareToken");

-- CreateTable: NoteComment
CREATE TABLE "NoteComment" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "noteId"          UUID         NOT NULL,
  "userId"          UUID         NOT NULL,
  "commentId"       TEXT         NOT NULL,
  "text"            TEXT         NOT NULL,
  "resolvedAt"      TIMESTAMP(3),
  "parentCommentId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteComment_commentId_key" ON "NoteComment"("commentId");
CREATE INDEX "NoteComment_noteId_idx"  ON "NoteComment"("noteId");
CREATE INDEX "NoteComment_userId_idx"  ON "NoteComment"("userId");

-- AddForeignKey for NoteComment.noteId
ALTER TABLE "NoteComment" ADD CONSTRAINT "NoteComment_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for NoteComment.userId
ALTER TABLE "NoteComment" ADD CONSTRAINT "NoteComment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: NoteSnapshot
CREATE TABLE "NoteSnapshot" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "noteId"      UUID         NOT NULL,
  "userId"      UUID         NOT NULL,
  "contentJson" JSONB        NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NoteSnapshot_noteId_createdAt_idx" ON "NoteSnapshot"("noteId", "createdAt");
CREATE INDEX "NoteSnapshot_userId_idx"            ON "NoteSnapshot"("userId");

-- AddForeignKey for NoteSnapshot.noteId
ALTER TABLE "NoteSnapshot" ADD CONSTRAINT "NoteSnapshot_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for NoteSnapshot.userId
ALTER TABLE "NoteSnapshot" ADD CONSTRAINT "NoteSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
