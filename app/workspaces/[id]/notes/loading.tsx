import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function NotesLoading() {
  return <PageLoadingSkeleton actions={6} cards={6} titleWidth="w-44" />;
}
