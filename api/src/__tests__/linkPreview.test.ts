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
