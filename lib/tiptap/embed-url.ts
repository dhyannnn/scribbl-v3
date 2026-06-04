export const EMBED_ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "loom.com", "www.loom.com",
  "figma.com", "www.figma.com",
];

export function toEmbedUrl(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }

  if (!EMBED_ALLOWED_HOSTS.includes(url.hostname)) return null;

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
