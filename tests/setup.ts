import { vi } from "vitest";

// Allow server-only imports in tests
vi.mock("server-only", () => ({}));

// Mock Next.js navigation — redirect throws so we can assert on the URL
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(url), { type: "redirect", url });
  }),
  notFound: vi.fn(() => {
    throw Object.assign(new Error("NOT_FOUND"), { type: "not_found" });
  }),
  // Re-throws Next.js internal errors (redirect, notFound) so catch blocks don't swallow them
  unstable_rethrow: vi.fn((err: unknown) => {
    const e = err as { type?: string };
    if (e?.type === "redirect" || e?.type === "not_found") throw err;
  }),
}));

// Mock Next.js cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
