import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function MeetingHubLoading() {
  return <PageLoadingSkeleton cards={3} panels={3} showForm titleWidth="w-80" />;
}
