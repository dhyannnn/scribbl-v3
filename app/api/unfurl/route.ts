import dns from "node:dns/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

function isPrivateIp(address: string): boolean {
  // Strip IPv4-mapped IPv6 prefix (::ffff:x.x.x.x)
  const ipv4 = address.startsWith("::ffff:") ? address.slice(7) : address;

  // IPv6 loopback
  if (address === "::1") return true;

  const parts = ipv4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url")?.trim() ?? "";

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  // SSRF protection — resolve hostname and block private/internal IPs
  try {
    const hostname = new URL(url).hostname;
    const { address } = await dns.lookup(hostname);
    if (isPrivateIp(address)) {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ScribblBot/1.0 (+https://scribblapp.ca)" },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return NextResponse.json({ error: "Could not fetch." }, { status: 502 });

    const html = await res.text();

    const title = extractMeta(html, "og:title") ?? extractTag(html, "title");
    const description = extractMeta(html, "og:description") ?? extractMeta(html, "description");
    const image = extractMeta(html, "og:image");
    const siteName = extractMeta(html, "og:site_name") ?? new URL(url).hostname;

    if (!title) return NextResponse.json({ error: "No preview available." }, { status: 204 });

    return NextResponse.json({ title, description, image, siteName, url });
  } catch {
    return NextResponse.json({ error: "Could not fetch." }, { status: 502 });
  }
}

function extractMeta(html: string, name: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, "i"));
  return m ? m[1].trim() : null;
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}
