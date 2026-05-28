import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function MeetingsLoading() {
  return <PageLoadingSkeleton cards={4} showForm titleWidth="w-48" />;
}
