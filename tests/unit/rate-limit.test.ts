import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { checkRateLimit } = await import("@/lib/rate-limit");

// $queryRaw returns an array of rows with a bigint count column
function mockCount(n: number) {
  prismaMock.$queryRaw.mockResolvedValue([{ count: BigInt(n) }] as never);
}

describe("checkRateLimit (#17)", () => {
  beforeEach(() => {
    mockCount(1);
  });

  it("allows the request when count is within limit", async () => {
    mockCount(5);
    const allowed = await checkRateLimit("test:user-1", 10, 60_000);
    expect(allowed).toBe(true);
  });

  it("allows the request when count equals the limit exactly", async () => {
    mockCount(10);
    const allowed = await checkRateLimit("test:user-1", 10, 60_000);
    expect(allowed).toBe(true);
  });

  it("blocks the request when count exceeds the limit", async () => {
    mockCount(11);
    const allowed = await checkRateLimit("test:user-1", 10, 60_000);
    expect(allowed).toBe(false);
  });

  it("allows when count is 1 (first call)", async () => {
    mockCount(1);
    const allowed = await checkRateLimit("test:user-2", 1, 60_000);
    expect(allowed).toBe(true);
  });

  it("blocks on the second call when limit is 1", async () => {
    mockCount(2);
    const allowed = await checkRateLimit("test:user-2", 1, 60_000);
    expect(allowed).toBe(false);
  });

  it("calls $queryRaw with the correct key as an interpolated value", async () => {
    mockCount(1);
    await checkRateLimit("liveblocks-auth:user-abc", 30, 60_000);
    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
    // The raw query is a tagged template — check the interpolated values array
    const [_template, ...values] = prismaMock.$queryRaw.mock.calls[0];
    expect(values).toContain("liveblocks-auth:user-abc");
  });

  it("handles missing count row gracefully (defaults to 1 — allowed)", async () => {
    prismaMock.$queryRaw.mockResolvedValue([] as never);
    const allowed = await checkRateLimit("test:empty", 5, 60_000);
    expect(allowed).toBe(true);
  });
});
