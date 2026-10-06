import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));
vi.mock("node:http", () => ({ default: { get: mocks.get } }));
import { extractLinkMetadata, fetchPublicPage, isPublicAddress, parsePublicUrl } from "../utils/linkPreview";

beforeEach(() => { mocks.lookup.mockReset(); mocks.get.mockReset(); });

describe("link preview address validation", () => {
  it("rejects local, private, mapped and reserved addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "not an IP"]) expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects invalid schemes, credentials, private literals and nonstandard ports", () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com", "http://localhost", "http://local.local", "http://127.1", "http://2130706433", "http://[::1]", "http://[::ffff:127.0.0.1]", "https://example.com:8443", "https://user:pass@example.com"]) expect(() => parsePublicUrl(url), url).toThrow();
    expect(parsePublicUrl("https://example.com/page").hostname).toBe("example.com");
  });

  it("refuses a host with any private DNS answer before opening a connection", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]);
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("non publique");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("pins the verified DNS answer and validates redirect destinations", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.get.mockImplementation((_url, options, callback) => {
      options.lookup("example.com", { all: true }, (_error: unknown, addresses: unknown) => expect(addresses).toEqual([{ address: "8.8.8.8", family: 4 }]));
      const response = Readable.from([]) as Readable & { statusCode: number; headers: object };
      response.statusCode = 302;
      response.headers = { location: "http://169.254.169.254/latest/meta-data/" };
      queueMicrotask(() => callback(response));
      return new EventEmitter();
    });
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("publics");
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});

describe("metadata extraction", () => {
  it("extracts Open Graph metadata and resolves relative thumbnail URLs", () => {
    const result = extractLinkMetadata('<title>Fallback</title><meta property="og:title" content="Article &amp; test"><meta name="description" content="Résumé"><meta property="og:image" content="/cover.jpg"><meta property="og:site_name" content="Blog">', "https://example.com/article");
    expect(result).toEqual({ title: "Article & test", description: "Résumé", image: "https://example.com/cover.jpg", siteName: "Blog" });
  });

  it("falls back to title and excludes unsafe image URLs", () => {
    expect(extractLinkMetadata('<title>Page</title><meta property="og:image" content="javascript:alert(1)">', "https://example.com")).toEqual({ title: "Page", description: "", image: undefined, siteName: "example.com" });
  });
});

describe("public page responses", () => {
  it("reads a public HTML response using the verified address", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.get.mockImplementation((_url, options, callback) => {
      options.lookup("example.com", {}, (_error: unknown, address: unknown, family: unknown) => {
        expect(address).toBe("8.8.8.8"); expect(family).toBe(4);
      });
      const response = Readable.from([Buffer.from("<title>Page</title>")]) as Readable & { statusCode: number; headers: object };
      response.statusCode = 200;
      response.headers = { "content-type": "text/html; charset=utf-8" };
      queueMicrotask(() => callback(response));
      return new EventEmitter();
    });
    await expect(fetchPublicPage("https://example.com/page", AbortSignal.timeout(1000))).resolves.toEqual({ url: "https://example.com/page", body: "<title>Page</title>", contentType: "text/html; charset=utf-8" });
  });

  it("rejects malformed redirect locations without crashing", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.get.mockImplementation((_url, _options, callback) => {
      const response = Readable.from([]) as Readable & { statusCode: number; headers: object };
      response.statusCode = 302;
      response.headers = { location: "http://[" };
      queueMicrotask(() => callback(response));
      return new EventEmitter();
    });
    await expect(fetchPublicPage("https://example.com/page", AbortSignal.timeout(1000))).rejects.toThrow();
  });
});

function pageResponse(body: string | Buffer, status = 200, headers: Record<string, string> = { "content-type": "text/html" }) {
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  mocks.get.mockImplementation((_url, _options, callback) => {
    const response = Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(body)]) as Readable & { statusCode: number; headers: object };
    response.statusCode = status;
    response.headers = headers;
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
}

describe("bounded preview fetching", () => {
  it("rejects an empty DNS answer before connecting", async () => {
    mocks.lookup.mockResolvedValue([]);
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("non publique");
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects an already aborted request", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const controller = new AbortController(); controller.abort();
    await expect(fetchPublicPage("https://example.com", controller.signal)).rejects.toThrow();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each([404, 500, 0])("rejects HTTP responses %i", async status => {
    pageResponse("error", status);
    await expect(fetchPublicPage("http://example.com", AbortSignal.timeout(1000))).rejects.toThrow("indisponible");
  });
  it("bounds redirect chains", async () => {
    pageResponse("", 302, { location: "/again" });
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("redirections");
    expect(mocks.get).toHaveBeenCalledTimes(4);
  });
  it("rejects responses larger than 512 KiB", async () => {
    pageResponse(Buffer.alloc(512 * 1024 + 1));
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("volumineuse");
  });
  it("propagates connection errors", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    mocks.get.mockImplementation(() => {
      const request = new EventEmitter();
      queueMicrotask(() => request.emit("error", new Error("Connection refused")));
      return request;
    });
    await expect(fetchPublicPage("https://example.com", AbortSignal.timeout(1000))).rejects.toThrow("Connection refused");
  });
  it("records empty content type when missing", async () => {
    pageResponse("body", 200, {});
    expect((await fetchPublicPage("http://example.com", AbortSignal.timeout(1000))).contentType).toBe("");
  });
});

describe("preview formats", () => {
  it("previews HTML pages", async () => {
    pageResponse('<title>Page</title>');
    const { getLinkPreview } = await import("../utils/linkPreview");
    expect(await getLinkPreview("https://example.com")).toMatchObject({ title: "Page", siteName: "example.com" });
  });
  it("rejects non-HTML pages", async () => {
    pageResponse("bytes", 200, { "content-type": "image/png" });
    const { getLinkPreview } = await import("../utils/linkPreview");
    await expect(getLinkPreview("https://example.com")).rejects.toThrow("HTML");
  });
  it("requests YouTube oEmbed and validates its thumbnail", async () => {
    pageResponse(JSON.stringify({ title: "Video", author_name: "Channel", thumbnail_url: "https://i.ytimg.com/cover.jpg" }));
    const { getLinkPreview } = await import("../utils/linkPreview");
    expect(await getLinkPreview("https://youtu.be/abc")).toEqual({ title: "Video", description: "Channel", image: "https://i.ytimg.com/cover.jpg", siteName: "YouTube" });
    expect(mocks.get.mock.calls[0][0].hostname).toBe("www.youtube.com");
    expect(mocks.get.mock.calls[0][0].searchParams.get("url")).toBe("https://youtu.be/abc");
  });
  it("handles missing oEmbed fields safely", async () => {
    pageResponse("{}");
    const { getLinkPreview } = await import("../utils/linkPreview");
    expect(await getLinkPreview("https://www.youtube.com/watch?v=abc")).toEqual({ title: "Vidéo YouTube", description: "", image: undefined, siteName: "YouTube" });
  });
  it("propagates malformed oEmbed data", async () => {
    pageResponse("invalid json");
    const { getLinkPreview } = await import("../utils/linkPreview");
    await expect(getLinkPreview("https://youtu.be/abc")).rejects.toThrow();
  });
  it("supports Twitter metadata and caps lengths", () => {
    const result = extractLinkMetadata(`<meta name="twitter:title" content="${"t".repeat(350)}"><meta name="twitter:description" content="${"d".repeat(650)}"><meta name="twitter:image" content="/image.png"><meta property="og:site_name" content="${"s".repeat(120)}">`, "https://example.com");
    expect(result.title).toHaveLength(300);
    expect(result.description).toHaveLength(600);
    expect(result.siteName).toHaveLength(100);
    expect(result.image).toBe("https://example.com/image.png");
    expect(extractLinkMetadata("", "https://example.com").title).toBe("example.com");
  });
  it("rejects excessively long URLs", () => {
    expect(() => parsePublicUrl(`https://example.com/${"a".repeat(2050)}`)).toThrow();
  });
});
