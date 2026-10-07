import * as cheerio from "cheerio";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFileSync: vi.fn(), lookup: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: mocks.readFileSync }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import { assertScrapableUrl, guardPageRequests, isAllowedRequest } from "../scraping/networkGuard";
import { buildScraperScript, MAX_RESULT_CHARS, ScraperTimeoutError } from "../scraping/sandbox";

/** A fake CDP session: `evaluate` answers Runtime.evaluate (first call = bundle, second = scraper). */
const fakePage = (evaluate: (expression: string, timeout: number) => Promise<unknown>) => {
  const session = {
    send: vi.fn(async (method: string, params: { expression: string; timeout: number }) => {
      if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "main" } } };
      if (method === "Page.createIsolatedWorld") return { executionContextId: 7 };
      return evaluate(params.expression, params.timeout);
    }),
    detach: vi.fn().mockResolvedValue(undefined),
  };
  return { page: { createCDPSession: vi.fn().mockResolvedValue(session) }, session };
};

// The sandbox module caches the bundle: reload it per test.
const loadSandbox = async () => {
  vi.resetModules();
  return import("../scraping/sandbox");
};

beforeEach(() => {
  mocks.readFileSync.mockReset().mockReturnValue("/* bundle */");
  mocks.lookup.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("buildScraperScript", () => {
  const run = (code: string, html = "<h1> T </h1><li>a</li><li>b</li>") =>
    vm.runInNewContext(buildScraperScript(code), { __tritouCheerio: { load: cheerio.load }, document: { documentElement: { outerHTML: html } } });

  it("runs the code with Cheerio on the page HTML and serialises `result`", () => {
    expect(JSON.parse(run('result = { t: $("h1").text().trim(), items: $("li").map((i, el) => $(el).text()).get() }'))).toEqual({ t: "T", items: ["a", "b"] });
  });

  it("keeps the old sloppy semantics: undeclared helpers, `var result`, missing result", () => {
    expect(JSON.parse(run("items = [1, 2]; var result = items;"))).toEqual([1, 2]);
    expect(JSON.parse(run("result = undefined"))).toBeNull();
    expect(JSON.parse(run("// nothing"))).toBeNull();
  });
});

describe("runScraperCode", () => {
  it("evaluates the bundle then the scraper in an isolated world, with a timeout", async () => {
    const { runScraperCode } = await loadSandbox();
    const { page, session } = fakePage(async (expression) => (expression === "/* bundle */" ? { result: {} } : { result: { value: '{"ok":true}' } }));
    expect(await runScraperCode(page as never, "result = { ok: true }", 2_000)).toEqual({ ok: true });
    expect(session.send).toHaveBeenCalledWith("Page.createIsolatedWorld", { frameId: "main", worldName: "tritou-scraper" });
    expect(session.send).toHaveBeenLastCalledWith("Runtime.evaluate", expect.objectContaining({ contextId: 7, returnByValue: true, timeout: 2_000 }));
    expect(session.detach).toHaveBeenCalledOnce();
  });

  it("reads the bundle once and explains how to build it when missing", async () => {
    const { runScraperCode } = await loadSandbox();
    const { page } = fakePage(async () => ({ result: { value: "null" } }));
    await runScraperCode(page as never, "");
    await runScraperCode(page as never, "");
    expect(mocks.readFileSync).toHaveBeenCalledOnce();

    const fresh = await loadSandbox();
    mocks.readFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    await expect(fresh.runScraperCode(page as never, "")).rejects.toThrow("npm run build:sandbox");
  });

  it("turns script exceptions into readable errors", async () => {
    const { runScraperCode } = await loadSandbox();
    let call = 0;
    const { page } = fakePage(async () => (call++ === 0 ? { result: {} } : { exceptionDetails: { exception: { description: "ReferenceError: x is not defined\n    at <anonymous>" } } }));
    await expect(runScraperCode(page as never, "x")).rejects.toThrow("Erreur dans le code du scraper : ReferenceError: x is not defined");

    call = 0;
    const { page: page2 } = fakePage(async () => (call++ === 0 ? { result: {} } : { exceptionDetails: { text: "Uncaught" } }));
    await expect(runScraperCode(page2 as never, "x")).rejects.toThrow("Erreur dans le code du scraper : Uncaught");

    call = 0;
    const { page: page3 } = fakePage(async () => (call++ === 0 ? { result: {} } : { exceptionDetails: {} }));
    await expect(runScraperCode(page3 as never, "x")).rejects.toThrow("Erreur inconnue");
  });

  it("maps V8 termination (exception or protocol error) to ScraperTimeoutError", async () => {
    const { runScraperCode, ScraperTimeoutError: TimeoutError } = await loadSandbox();
    let call = 0;
    const { page } = fakePage(async () => (call++ === 0 ? { result: {} } : { exceptionDetails: { exception: { description: "Error: Execution was terminated" } } }));
    await expect(runScraperCode(page as never, "while(true){}", 1_000)).rejects.toBeInstanceOf(TimeoutError);

    call = 0;
    const { page: page2 } = fakePage(async () => {
      if (call++ === 0) return { result: {} };
      throw new Error("Protocol error (Runtime.evaluate): Execution was terminated");
    });
    await expect(runScraperCode(page2 as never, "while(true){}", 1_000)).rejects.toThrow("1 s");

    call = 0;
    const { page: page3 } = fakePage(async () => {
      if (call++ === 0) return { result: {} };
      throw new Error("Target closed");
    });
    await expect(runScraperCode(page3 as never, "x")).rejects.toThrow("Target closed");
  });

  it("gives up when the renderer stops answering", async () => {
    const { runScraperCode, ScraperTimeoutError: TimeoutError } = await loadSandbox();
    vi.useFakeTimers();
    let call = 0;
    const { page, session } = fakePage(async () => (call++ === 0 ? { result: {} } : new Promise(() => {})));
    const pending = runScraperCode(page as never, "x", 1_000);
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
    expect(session.detach).toHaveBeenCalled();
  });

  it("rejects non-serialisable and oversized results", async () => {
    const { runScraperCode } = await loadSandbox();
    let call = 0;
    const { page } = fakePage(async () => (call++ === 0 ? { result: {} } : { result: {} }));
    await expect(runScraperCode(page as never, "x")).rejects.toThrow("sérialisable");

    call = 0;
    const { page: page2 } = fakePage(async () => (call++ === 0 ? { result: {} } : { result: { value: "x".repeat(MAX_RESULT_CHARS + 1) } }));
    await expect(runScraperCode(page2 as never, "x")).rejects.toThrow("trop volumineux");
  });

  it("exposes a timeout error with a readable message", () => {
    expect(new ScraperTimeoutError(15_000).message).toBe("Le code du scraper a dépassé 15 s et a été arrêté.");
  });
});

describe("assertScrapableUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(assertScrapableUrl("https://www.amazon.fr/dp/X?y=1")).toBe("https://www.amazon.fr/dp/X?y=1");
    expect(assertScrapableUrl("http://93.184.216.34:8080/")).toBe("http://93.184.216.34:8080/");
  });

  it.each(["not a url", "file:///etc/passwd", "ftp://example.com", "http://localhost:3000", "http://api.local/", "http://user:pw@example.com", "http://10.0.0.5/", "http://[::1]/", "http://169.254.169.254/"])(
    "refuses %s with a 400",
    (url) => {
      expect(() => assertScrapableUrl(url)).toThrow(expect.objectContaining({ status: 400 }));
    },
  );
});

describe("isAllowedRequest", () => {
  it("allows data, blob and about:blank, refuses other schemes and invalid URLs", async () => {
    const cache = new Map();
    expect(await isAllowedRequest("data:text/html,x", cache)).toBe(true);
    expect(await isAllowedRequest("blob:https://example.com/123", cache)).toBe(true);
    expect(await isAllowedRequest("about:blank", cache)).toBe(true);
    expect(await isAllowedRequest("file:///etc/passwd", cache)).toBe(false);
    expect(await isAllowedRequest("chrome://settings", cache)).toBe(false);
    expect(await isAllowedRequest("::", cache)).toBe(false);
  });

  it("checks IP literals and local names without DNS", async () => {
    const cache = new Map();
    expect(await isAllowedRequest("http://93.184.216.34/", cache)).toBe(true);
    expect(await isAllowedRequest("http://192.168.1.1/", cache)).toBe(false);
    expect(await isAllowedRequest("http://[fd00::1]/", cache)).toBe(false);
    expect(await isAllowedRequest("http://printer.local/", cache)).toBe(false);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("resolves names once per host and requires every address to be public", async () => {
    const cache = new Map();
    mocks.lookup.mockImplementation(async (host: string) =>
      host === "shop.example" ? [{ address: "93.184.216.34" }] : host === "rebind.example" ? [{ address: "93.184.216.34" }, { address: "10.0.0.1" }] : [],
    );
    expect(await isAllowedRequest("https://shop.example/a", cache)).toBe(true);
    expect(await isAllowedRequest("https://shop.example/b", cache)).toBe(true);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(await isAllowedRequest("https://rebind.example/", cache)).toBe(false);
    expect(await isAllowedRequest("https://nothing.example/", cache)).toBe(false);
    mocks.lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isAllowedRequest("https://unknown.example/", cache)).toBe(false);
  });
});

describe("guardPageRequests", () => {
  it("intercepts requests and continues or aborts them", async () => {
    let handler: ((request: unknown) => void) | undefined;
    const page = { setRequestInterception: vi.fn(), on: vi.fn((_event: string, fn: typeof handler) => { handler = fn; }) };
    await guardPageRequests(page as never);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);

    const request = (url: string) => ({ url: () => url, continue: vi.fn(), abort: vi.fn() });
    const ok = request("data:text/html,x");
    const blocked = request("http://127.0.0.1/");
    const broken = { url: () => { throw new Error("detached"); }, continue: vi.fn(), abort: vi.fn() };
    handler!(ok);
    handler!(blocked);
    await vi.waitFor(() => {
      expect(ok.continue).toHaveBeenCalled();
      expect(blocked.abort).toHaveBeenCalledWith("blockedbyclient");
    });
    expect(() => handler!(broken)).toThrow("detached");
  });

  it("swallows continue/abort failures", async () => {
    let handler: ((request: unknown) => void) | undefined;
    const page = { setRequestInterception: vi.fn(), on: vi.fn((_event: string, fn: typeof handler) => { handler = fn; }) };
    await guardPageRequests(page as never);
    const continueFails = { url: () => "data:text/html,x", continue: vi.fn().mockRejectedValue(new Error("handled")), abort: vi.fn() };
    // A rejected continue() must not crash the worker (it is fire-and-forget).
    handler!(continueFails);
    await vi.waitFor(() => expect(continueFails.continue).toHaveBeenCalled());
  });
});
