export type LinkMode = "url" | "embed" | "preview";
export interface WebLink {
  id: string;
  url: string;
  mode: LinkMode;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 2048 && !/[\s<>]/.test(value) && /^https?:$/.test(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function serializeWebLink(data: WebLink): string {
  return `::link[${encodeURIComponent(JSON.stringify(data))}]::`;
}

export function parseWebLink(source: string): WebLink | null {
  try {
    const data = JSON.parse(decodeURIComponent(source.slice(7, -3)));
    if (!data || typeof data.id !== "string" || typeof data.url !== "string" || !isWebUrl(data.url) || !["url", "embed", "preview"].includes(data.mode)) return null;
    const link: WebLink = { id: data.id, url: data.url, mode: data.mode };
    for (const key of ["title", "description", "image", "siteName"] as const) {
      if (typeof data[key] === "string" && (key !== "image" || isWebUrl(data[key]))) link[key] = data[key];
    }
    return link;
  } catch { return null; }
}

export function youtubeVideo(url: string): { id: string; embed: string; image: string } | null {
  if (!isWebUrl(url)) return null;
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = parsed.pathname.split("/")[1];
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else if (/^\/(shorts|embed|live)\//.test(parsed.pathname)) id = parsed.pathname.split("/")[2];
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const time = parsed.searchParams.get("t") ?? parsed.searchParams.get("start");
  if (time) {
    const match = time.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    const seconds = /^\d+$/.test(time) ? Number(time) : match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
    if (seconds > 0) embed.searchParams.set("start", String(seconds));
  }
  return { id, embed: embed.href, image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
}

export function webUrlOnLine(text: string, cursor: number): string | null {
  const start = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const nextLine = text.indexOf("\n", cursor);
  const line = text.slice(start, nextLine === -1 ? text.length : nextLine).trim();
  return isWebUrl(line) ? line : null;
}

export function insertPastedWebLink(text: string, start: number, end: number, pasted: string): { text: string; data: WebLink } | null {
  const url = pasted.trim();
  if (!isWebUrl(url)) return null;
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (before.slice(before.lastIndexOf("\n") + 1).trim() || after.split("\n")[0].trim()) return null;
  const data: WebLink = { id: crypto.randomUUID(), url, mode: "url" };
  return {
    text: before.slice(0, before.lastIndexOf("\n") + 1) + serializeWebLink(data) + after.replace(/^[ \t]*/, ""),
    data,
  };
}
