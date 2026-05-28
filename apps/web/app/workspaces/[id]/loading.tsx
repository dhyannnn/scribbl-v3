import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function WorkspaceLoading() {
  return <PageLoadingSkeleton cards={5} panels={0} showForm showMetrics titleWidth="w-72" />;
}
