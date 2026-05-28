import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function FilesLoading() {
  return <PageLoadingSkeleton cards={5} showForm titleWidth="w-36" />;
}
