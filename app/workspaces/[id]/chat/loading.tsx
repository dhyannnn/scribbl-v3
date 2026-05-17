export default function ChatLoading() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#20201d]">
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-5 py-6 sm:px-8 lg:gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-10">
        <aside className="lg:rounded-md lg:border lg:border-[#d8d8ce] lg:bg-white lg:p-4 lg:shadow-sm">
          <div className="h-4 w-32 animate-pulse rounded bg-[#e6e6dc]" />
          <div className="mt-5 hidden h-7 w-24 animate-pulse rounded bg-[#e6e6dc] lg:block" />
          <div className="mt-4 flex gap-2 lg:grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 w-40 animate-pulse rounded-md bg-[#e6e6dc] lg:w-full" />
            ))}
          </div>
        </aside>
        <div className="rounded-md border border-[#d8d8ce] bg-white shadow-sm">
          <div className="border-b border-[#e6e6dc] p-5">
            <div className="h-4 w-24 animate-pulse rounded bg-[#e6e6dc]" />
            <div className="mt-3 h-6 w-40 animate-pulse rounded bg-[#e6e6dc]" />
          </div>
          <div className="flex flex-col gap-4 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#e6e6dc]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-[#e6e6dc]" />
                  <div className="h-4 w-full max-w-xs animate-pulse rounded bg-[#e6e6dc]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
