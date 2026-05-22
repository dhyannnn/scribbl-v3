export default function ChatLoading() {
  return (
    <div className="flex h-full min-h-screen bg-[var(--color-bg)]">
      {/* Channel list skeleton */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        <div className="border-b border-[var(--color-border)] p-4">
          <Bone className="h-4 w-24" />
          <Bone className="mt-4 h-7 w-36" />
        </div>
        <div className="flex flex-col gap-1 p-3">
          {[1, 2, 3].map((i) => (
            <Bone key={i} className="h-9 w-full rounded-full" />
          ))}
        </div>
      </aside>

      {/* Messages skeleton */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-5">
          <Bone className="h-4 w-4 rounded-full" />
          <Bone className="h-4 w-32" />
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 p-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`flex items-start gap-3 ${i % 3 === 0 ? "flex-row-reverse" : ""}`}>
              <Bone className="size-8 shrink-0 rounded-full" />
              <div className={`flex max-w-[60%] flex-col gap-1.5 ${i % 3 === 0 ? "items-end" : ""}`}>
                <Bone className="h-3 w-20" />
                <Bone className={`h-10 rounded-2xl ${i % 2 === 0 ? "w-56" : "w-40"}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-[var(--color-border)] p-4">
          <Bone className="h-11 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-[var(--color-surface-high)] ${className}`} />;
}
