import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url")?.trim() ?? "";

  if (!url || !/^https?:\/\//i.test(url)) {
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
