import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SharedNoteViewer } from "./SharedNoteViewer";
import { SharedWhiteboardViewer } from "./SharedWhiteboardViewer";
import type { TLStoreSnapshot } from "tldraw";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const note = await prisma.note.findFirst({
    where: { shareToken: token, isPublic: true, deletedAt: null },
    select: { id: true, title: true, type: true, contentJson: true },
  });

  if (!note) notFound();

  const isWhiteboard = note.type === "WHITEBOARD" || note.type === "MINDBOARD";

  return (
    <div className="min-h-screen bg-[var(--color-surface-low)] py-12">
      <div className={`mx-auto px-4 ${isWhiteboard ? "max-w-5xl" : "max-w-3xl"}`}>
        <div className="mb-6">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--color-secondary)]">
            {note.type === "MINDBOARD" ? "Mind Board" : note.type === "WHITEBOARD" ? "Whiteboard" : "Note"}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[var(--color-text)]">{note.title}</h1>
        </div>

        {isWhiteboard ? (
          <SharedWhiteboardViewer
            snapshot={getTldrawSnapshot(note.contentJson)}
            isMindboard={note.type === "MINDBOARD"}
          />
        ) : (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
            <SharedNoteViewer contentJson={note.contentJson} />
          </div>
        )}
      </div>
    </div>
  );
}

function getTldrawSnapshot(contentJson: unknown): TLStoreSnapshot {
  const c = contentJson as { type?: string; snapshot?: unknown } | null;
  return (c?.type === "tldraw" ? c.snapshot : {}) as TLStoreSnapshot;
}
