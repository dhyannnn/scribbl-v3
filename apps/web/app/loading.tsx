import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function DashboardLoading() {
  return <PageLoadingSkeleton cards={4} panels={3} showForm titleWidth="w-72" />;
}
