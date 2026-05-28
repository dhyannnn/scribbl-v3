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
}));

// Mock Next.js cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
