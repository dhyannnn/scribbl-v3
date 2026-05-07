type PageLoadingSkeletonProps = {
  actions?: number;
  cards?: number;
  maxWidth?: "3xl" | "7xl";
  panels?: number;
  showForm?: boolean;
  showMetrics?: boolean;
  titleWidth?: string;
};

export function PageLoadingSkeleton({
  actions = 0,
  cards = 4,
  maxWidth = "7xl",
  panels = 0,
  showForm = false,
  showMetrics = false,
  titleWidth = "w-56",
}: PageLoadingSkeletonProps) {
  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div
        className={`mx-auto flex w-full ${
          maxWidth === "3xl" ? "max-w-3xl" : "max-w-7xl"
        } flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10`}
      >
        <header className="border-b border-[#d8d8ce] pb-6">
          <SkeletonLine className="h-4 w-36" />
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <SkeletonLine className="h-4 w-44" />
              <SkeletonLine className={`mt-4 h-10 ${titleWidth}`} />
              <SkeletonLine className="mt-4 h-4 w-full max-w-2xl" />
              <SkeletonLine className="mt-2 h-4 w-full max-w-lg" />
            </div>
            {showMetrics ? (
              <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="rounded-md border border-[#d8d8ce] bg-white p-3 shadow-sm">
                    <SkeletonLine className="mx-auto h-3 w-16" />
                    <SkeletonLine className="mx-auto mt-3 h-7 w-10" />
                  </div>
                ))}
              </div>
            ) : null}
            {actions > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: actions }).map((_, index) => (
                  <SkeletonLine key={index} className="h-11 w-full min-w-36 rounded-md" />
                ))}
              </div>
            ) : null}
          </div>
        </header>

        {showForm ? <FormSkeleton /> : null}

        {panels > 0 ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: panels }).map((_, index) => (
              <PanelSkeleton key={index} />
            ))}
          </section>
        ) : null}

        <section className="grid gap-4">
          {Array.from({ length: cards }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </section>
      </div>
    </main>
  );
}

function FormSkeleton() {
  return (
    <section className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <SkeletonLine className="h-6 w-44" />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_160px_auto]">
        <SkeletonLine className="h-11 rounded-md" />
        <SkeletonLine className="h-11 rounded-md" />
        <SkeletonLine className="h-11 rounded-md" />
        <SkeletonLine className="h-11 rounded-md" />
        <SkeletonLine className="h-24 rounded-md lg:col-span-4" />
      </div>
    </section>
  );
}

function PanelSkeleton() {
  return (
    <article className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <SkeletonLine className="h-4 w-24" />
      <SkeletonLine className="mt-4 h-6 w-40" />
      <SkeletonLine className="mt-4 h-4 w-full" />
      <SkeletonLine className="mt-2 h-4 w-2/3" />
    </article>
  );
}

function CardSkeleton() {
  return (
    <article className="rounded-md border border-[#d8d8ce] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="mt-4 h-6 w-2/3 max-w-md" />
          <SkeletonLine className="mt-4 h-4 w-full max-w-2xl" />
          <SkeletonLine className="mt-2 h-4 w-3/5" />
        </div>
        <div className="grid gap-3 rounded-md bg-[#fbfbf8] p-4 sm:min-w-[260px]">
          <SkeletonLine className="h-4 w-32" />
          <SkeletonLine className="h-4 w-40" />
          <SkeletonLine className="h-9 w-full rounded-md" />
        </div>
      </div>
    </article>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-[#e6e6dc] ${className}`} />;
}
