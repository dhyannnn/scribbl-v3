import { describe, expect, it } from "vitest";

// ── Margin unit conversion (mirrors PageSetupModal logic) ─────────────────────

const PX_PER_INCH = 96;
function pxToIn(px: number) { return Math.round((px / PX_PER_INCH) * 100) / 100; }
function inToPx(inches: number) { return Math.round(inches * PX_PER_INCH); }

describe("pxToIn", () => {
  it("converts 72px to 0.75 inches (1 inch = 96px)", () => {
    expect(pxToIn(72)).toBe(0.75);
  });

  it("converts 96px to exactly 1 inch", () => {
    expect(pxToIn(96)).toBe(1);
  });

  it("converts 0px to 0", () => {
    expect(pxToIn(0)).toBe(0);
  });

  it("round-trips through inToPx", () => {
    for (const px of [0, 24, 48, 72, 96, 120, 192]) {
      expect(inToPx(pxToIn(px))).toBe(px);
    }
  });
});

describe("inToPx", () => {
  it("converts 1 inch to 96px", () => {
    expect(inToPx(1)).toBe(96);
  });

  it("converts 0.75 inches to 72px", () => {
    expect(inToPx(0.75)).toBe(72);
  });

  it("converts 0 to 0", () => {
    expect(inToPx(0)).toBe(0);
  });

  it("converts 2 inches to 192px", () => {
    expect(inToPx(2)).toBe(192);
  });
});

// ── Orientation values ────────────────────────────────────────────────────────

function pageWidth(orientation: string): number {
  return orientation === "landscape" ? 1056 : 816;
}

describe("pageWidth", () => {
  it("portrait returns 816", () => {
    expect(pageWidth("portrait")).toBe(816);
  });

  it("landscape returns 1056", () => {
    expect(pageWidth("landscape")).toBe(1056);
  });

  it("unknown orientation defaults to portrait width", () => {
    expect(pageWidth("unknown")).toBe(816);
  });
});

// ── toEmbedUrl (pure URL converter from embed-node.tsx) ───────────────────────

function toEmbedUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }

  const ALLOWED = ["youtube.com", "www.youtube.com", "youtu.be", "loom.com", "www.loom.com", "figma.com", "www.figma.com"];
  if (!ALLOWED.includes(url.hostname)) return null;

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be") {
    const videoId = host === "youtu.be"
      ? url.pathname.slice(1)
      : url.searchParams.get("v");
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}`;
  }

  return raw;
}

describe("toEmbedUrl", () => {
  it("converts youtube.com watch URL to embed URL", () => {
    const result = toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("converts youtu.be short URL to embed URL", () => {
    const result = toEmbedUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("returns loom URL unchanged", () => {
    const url = "https://www.loom.com/share/abc123";
    expect(toEmbedUrl(url)).toBe(url);
  });

  it("returns figma URL unchanged", () => {
    const url = "https://www.figma.com/file/abc/design";
    expect(toEmbedUrl(url)).toBe(url);
  });

  it("returns null for disallowed domain", () => {
    expect(toEmbedUrl("https://evil.com/embed/abc")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(toEmbedUrl("not-a-url")).toBeNull();
  });

  it("returns null for youtube watch URL without v param", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch")).toBeNull();
  });

  it("returns null for youtu.be URL with no path", () => {
    expect(toEmbedUrl("https://youtu.be/")).toBeNull();
  });
});

// ── NoteSnapshot pruning logic ────────────────────────────────────────────────

const MAX_SNAPSHOTS = 50;

function snapshotsToDelete(currentCount: number): number {
  return currentCount > MAX_SNAPSHOTS ? currentCount - MAX_SNAPSHOTS : 0;
}

describe("snapshotsToDelete", () => {
  it("returns 0 when at exactly the limit", () => {
    expect(snapshotsToDelete(50)).toBe(0);
  });

  it("returns 0 when below the limit", () => {
    expect(snapshotsToDelete(30)).toBe(0);
  });

  it("returns 1 when one over the limit", () => {
    expect(snapshotsToDelete(51)).toBe(1);
  });

  it("returns the correct surplus for larger counts", () => {
    expect(snapshotsToDelete(60)).toBe(10);
  });

  it("returns 0 for count = 0", () => {
    expect(snapshotsToDelete(0)).toBe(0);
  });
});

// ── Allowed embed hosts ───────────────────────────────────────────────────────

const EMBED_ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "loom.com", "www.loom.com",
  "figma.com", "www.figma.com",
];

function isAllowedEmbedHost(hostname: string): boolean {
  return EMBED_ALLOWED_HOSTS.includes(hostname);
}

describe("isAllowedEmbedHost", () => {
  it("allows youtube.com", () => expect(isAllowedEmbedHost("youtube.com")).toBe(true));
  it("allows www.youtube.com", () => expect(isAllowedEmbedHost("www.youtube.com")).toBe(true));
  it("allows youtu.be", () => expect(isAllowedEmbedHost("youtu.be")).toBe(true));
  it("allows loom.com", () => expect(isAllowedEmbedHost("loom.com")).toBe(true));
  it("allows www.loom.com", () => expect(isAllowedEmbedHost("www.loom.com")).toBe(true));
  it("allows figma.com", () => expect(isAllowedEmbedHost("figma.com")).toBe(true));
  it("rejects unknown domain", () => expect(isAllowedEmbedHost("evil.com")).toBe(false));
  it("rejects empty string", () => expect(isAllowedEmbedHost("")).toBe(false));
  it("rejects subdomain not in allowlist", () => expect(isAllowedEmbedHost("embed.loom.com")).toBe(false));
});
