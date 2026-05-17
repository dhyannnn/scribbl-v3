import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function MembersLoading() {
  return <PageLoadingSkeleton cards={3} showForm titleWidth="w-36" />;
}
