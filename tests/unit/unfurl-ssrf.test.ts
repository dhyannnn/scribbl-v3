import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

// dns.lookup is mocked per-test to control IP resolution
vi.mock("node:dns/promises", () => ({
  default: { lookup: vi.fn() },
}));

import dns from "node:dns/promises";
const mockDnsLookup = vi.mocked(dns.lookup);

const { GET } = await import("@/app/api/unfurl/route");

function makeUser() {
  return { id: "user-1", displayName: "Test User" };
}

function makeReq(url: string) {
  return new Request(`http://localhost/api/unfurl?url=${encodeURIComponent(url)}`);
}

// ── Auth guard ────────────────────────────────────────────────────────────────

describe("GET /api/unfurl — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(makeReq("https://example.com"));
    expect(res.status).toBe(401);
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("GET /api/unfurl — input validation", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
  });

  it("rejects missing url", async () => {
    const res = await GET(new Request("http://localhost/api/unfurl"));
    expect(res.status).toBe(400);
  });

  it("rejects non-http url", async () => {
    const res = await GET(makeReq("ftp://example.com/file"));
    expect(res.status).toBe(400);
  });

  it("rejects a bare string with no scheme", async () => {
    const res = await GET(makeReq("example.com"));
    expect(res.status).toBe(400);
  });
});

// ── SSRF — private IP blocking (#3) ──────────────────────────────────────────

describe("GET /api/unfurl — SSRF protection", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockResolvedValue(makeUser());
  });

  const privateAddresses = [
    ["10.0.0.1",      "RFC1918 class A"],
    ["10.255.255.255","RFC1918 class A upper bound"],
    ["172.16.0.1",    "RFC1918 class B lower bound"],
    ["172.31.255.255","RFC1918 class B upper bound"],
    ["192.168.0.1",   "RFC1918 class C"],
    ["192.168.255.255","RFC1918 class C upper bound"],
    ["127.0.0.1",     "loopback"],
    ["127.255.255.255","loopback upper bound"],
    ["169.254.0.1",   "link-local"],
    ["0.0.0.1",       "0.x block"],
    ["100.64.0.1",    "shared address space RFC6598 lower"],
    ["100.127.255.255","shared address space RFC6598 upper"],
    ["::1",           "IPv6 loopback"],
    ["::ffff:10.0.0.1","IPv4-mapped IPv6 private"],
    ["::ffff:192.168.1.1","IPv4-mapped IPv6 private class C"],
  ];

  for (const [ip, label] of privateAddresses) {
    it(`blocks ${label} (${ip})`, async () => {
      mockDnsLookup.mockResolvedValue({ address: ip, family: 4 } as never);
      const res = await GET(makeReq("https://internal.example.com/secret"));
      expect(res.status).toBe(400);
    });
  }

  it("allows a public IP through to fetch", async () => {
    mockDnsLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 } as never);
    // fetch will fail in test env — that's fine, we just want to confirm no 400 from IP check
    const res = await GET(makeReq("https://example.com"));
    expect(res.status).not.toBe(400);
  });

  it("returns 400 when DNS lookup fails", async () => {
    mockDnsLookup.mockRejectedValue(new Error("ENOTFOUND"));
    const res = await GET(makeReq("https://doesnotexist.invalid"));
    expect(res.status).toBe(400);
  });
});
