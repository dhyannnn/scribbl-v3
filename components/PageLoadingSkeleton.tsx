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
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div
        className={`mx-auto flex w-full ${
          maxWidth === "3xl" ? "max-w-3xl" : "max-w-7xl"
        } flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10`}
      >
        <header className="border-b border-[var(--color-border)] pb-6">
          <Bone className="h-4 w-36" />
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 flex-1">
              <Bone className="h-4 w-44" />
              <Bone className={`mt-4 h-10 ${titleWidth}`} />
              <Bone className="mt-4 h-4 w-full max-w-2xl" />
              <Bone className="mt-2 h-4 w-full max-w-lg" />
            </div>
            {showMetrics && (
              <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                    <Bone className="mx-auto h-3 w-16" />
                    <Bone className="mx-auto mt-3 h-7 w-10" />
                  </div>
                ))}
              </div>
            )}
            {actions > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: actions }).map((_, i) => (
                  <Bone key={i} className="h-11 w-full min-w-36 rounded-full" />
                ))}
              </div>
            )}
          </div>
        </header>

        {showForm && <FormSkeleton />}

        {panels > 0 && (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: panels }).map((_, i) => (
              <PanelSkeleton key={i} />
            ))}
          </section>
        )}

        <section className="grid gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </section>
      </div>
    </main>
  );
}

function FormSkeleton() {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <Bone className="h-6 w-44" />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px_160px_auto]">
        <Bone className="h-11 rounded-full" />
        <Bone className="h-11 rounded-full" />
        <Bone className="h-11 rounded-full" />
        <Bone className="h-11 rounded-full" />
        <Bone className="h-24 rounded-2xl lg:col-span-4" />
      </div>
    </section>
  );
}

function PanelSkeleton() {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <Bone className="h-4 w-24" />
      <Bone className="mt-4 h-6 w-40" />
      <Bone className="mt-4 h-4 w-full" />
      <Bone className="mt-2 h-4 w-2/3" />
    </article>
  );
}

function CardSkeleton() {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Bone className="h-4 w-36" />
          <Bone className="mt-4 h-6 w-2/3 max-w-md" />
          <Bone className="mt-4 h-4 w-full max-w-2xl" />
          <Bone className="mt-2 h-4 w-3/5" />
        </div>
        <div className="grid gap-3 rounded-2xl bg-[var(--color-surface-low)] p-4 sm:min-w-[260px]">
          <Bone className="h-4 w-32" />
          <Bone className="h-4 w-40" />
          <Bone className="h-9 w-full rounded-full" />
        </div>
      </div>
    </article>
  );
}

function Bone({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded bg-[var(--color-surface-high)] ${className}`} />
  );
}
