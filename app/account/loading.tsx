import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

export default function AccountLoading() {
  return <PageLoadingSkeleton cards={2} maxWidth="3xl" showForm titleWidth="w-44" />;
}
