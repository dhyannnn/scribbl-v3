import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function NotificationsLoading() {
  return <PageLoadingSkeleton cards={5} maxWidth="3xl" titleWidth="w-44" />;
}
