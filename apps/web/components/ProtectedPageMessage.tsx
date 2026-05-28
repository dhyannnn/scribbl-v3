import Link from "next/link";

export function ProtectedPageMessage({
  title = "Sign in to continue",
  message = "Use your Scribbl account to open this workspace.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-16 text-[#20201d]">
      <section className="mx-auto max-w-xl rounded-md border border-[#d8d8ce] bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#6d7f70]">Protected workspace</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#62645c]">{message}</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-md bg-[#2f604b] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#244b3a]"
        >
          Go to login
        </Link>
      </section>
    </main>
  );
}
