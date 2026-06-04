import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SharedNoteViewer } from "./SharedNoteViewer";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const note = await prisma.note.findFirst({
    where: { shareToken: token, isPublic: true, deletedAt: null },
    select: { id: true, title: true, contentJson: true },
  });

  if (!note) notFound();

  return (
    <div className="min-h-screen bg-[var(--color-surface-low)] py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <h1 className="mb-6 font-display text-2xl font-bold text-[var(--color-text)]">{note.title}</h1>
        <SharedNoteViewer contentJson={note.contentJson} />
      </div>
    </div>
  );
}
