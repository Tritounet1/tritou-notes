import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import * as cheerio from "cheerio";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 96], ["64:ff9b::", 96], ["100::", 64],
  ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(network, prefix, "ipv6");
blocked.addAddress("::1", "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function parsePublicUrl(input: string): URL {
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (input.length > 2048 || !["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || (isIP(host) && !isPublicAddress(host))) {
    throw new Error("Seuls les liens HTTP ou HTTPS publics sont acceptés.");
  }
  return url;
}

export async function fetchPublicPage(input: string, signal: AbortSignal, redirects = 0): Promise<{ url: string; body: string; contentType: string }> {
  const url = parsePublicUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("Adresse non publique.");
  signal.throwIfAborted();
  const resolved = addresses[0];
  return new Promise((resolve, reject) => {
    // Pin the verified DNS result for the connection, including every redirect.
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(url, {
      signal,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [resolved]) : callback(null, resolved.address, resolved.family),
      headers: { "User-Agent": "TritouNotes-LinkPreview/1.0", Accept: "text/html,application/json" },
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        if (redirects >= 3) return reject(new Error("Trop de redirections."));
        try {
          void fetchPublicPage(new URL(response.headers.location, url).href, signal, redirects + 1).then(resolve, reject);
        } catch (error) { reject(error); }
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error("Page indisponible.")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 512 * 1024) {
          response.destroy(new Error("Page trop volumineuse."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ url: url.href, body: Buffer.concat(chunks).toString("utf8"), contentType: response.headers["content-type"] || "" }));
    });
    request.on("error", reject);
  });
}

function safeImage(value: string | undefined, base: string): string | undefined {
  if (!value) return;
  try { return parsePublicUrl(new URL(value, base).href).href; } catch { return; }
}

export function extractLinkMetadata(html: string, url: string) {
  const $ = cheerio.load(html);
  const meta = (key: string) => $(`meta[property="${key}"], meta[name="${key}"]`).first().attr("content")?.trim();
  return {
    title: (meta("og:title") || meta("twitter:title") || $("title").first().text().trim() || new URL(url).hostname).slice(0, 300),
    description: (meta("og:description") || meta("twitter:description") || meta("description") || "").slice(0, 600),
    image: safeImage(meta("og:image") || meta("twitter:image"), url),
    siteName: (meta("og:site_name") || new URL(url).hostname).slice(0, 100),
  };
}

export async function getLinkPreview(input: string) {
  const url = parsePublicUrl(input);
  const signal = AbortSignal.timeout(8000);
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) {
    const oembed = new URL("https://www.youtube.com/oembed");
    oembed.searchParams.set("url", url.href);
    oembed.searchParams.set("format", "json");
    const response = await fetchPublicPage(oembed.href, signal);
    const data = JSON.parse(response.body);
    return { title: String(data.title || "Vidéo YouTube").slice(0, 300), description: String(data.author_name || "").slice(0, 600), image: safeImage(data.thumbnail_url, url.href), siteName: "YouTube" };
  }
  const response = await fetchPublicPage(url.href, signal);
  if (!response.contentType.includes("text/html")) throw new Error("Cette page ne fournit pas d’aperçu HTML.");
  return extractLinkMetadata(response.body, response.url);
}
