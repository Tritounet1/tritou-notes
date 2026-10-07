import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { guardPageRequests } from "../../scraping/networkGuard";
import { runScraperCode, ScraperTimeoutError } from "../../scraping/sandbox";

// Real Chromium: proves that scraper code cannot reach Node and that internal addresses are blocked.
let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!existsSync(resolve(__dirname, "../../../sandbox/cheerio.browser.js"))) {
    const build = spawnSync("node", ["scripts/build-sandbox.mjs"], { cwd: resolve(__dirname, "../../.."), stdio: "inherit" });
    if (build.status !== 0) throw new Error("build-sandbox failed");
  }
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  await page?.close().catch(() => {});
  page = await browser.newPage();
  await page.setContent(`<html><body>
    <h1> Prix </h1><ul><li data-p="3">a &amp; b</li><li data-p="4">c</li></ul>
    <script>window.$ = () => "page jQuery"; window.secret = "page-only";</script>
  </body></html>`);
});

describe("scraper sandbox (real Chromium)", () => {
  it("runs Cheerio code against the page and returns `result`", async () => {
    const result = await runScraperCode(page, `
      result = {
        title: $("h1").text().trim(),
        items: $("li").map((i, el) => ({ name: $(el).text(), price: Number($(el).attr("data-p")) })).get(),
      };
    `);
    expect(result).toEqual({ title: "Prix", items: [{ name: "a & b", price: 3 }, { name: "c", price: 4 }] });
  });

  it("gives the code no access to Node, whatever the escape attempt", async () => {
    const result = await runScraperCode(page, `
      result = {
        process: typeof process,
        require: typeof require,
        viaConstructor: this.constructor.constructor("return typeof process")(),
        viaCheerio: $.constructor.constructor("return typeof process")(),
        globalKeys: typeof Buffer,
      };
    `);
    expect(result).toEqual({ process: "undefined", require: "undefined", viaConstructor: "undefined", viaCheerio: "undefined", globalKeys: "undefined" });
  });

  it("is isolated from the page's own JavaScript", async () => {
    const result = await runScraperCode(page, `result = { secret: typeof window.secret, dollar: typeof $.load === "function" || typeof $.html === "function" };`);
    expect(result).toEqual({ secret: "undefined", dollar: true });
    expect(await page.evaluate(() => typeof (globalThis as { __tritouCheerio?: unknown }).__tritouCheerio)).toBe("undefined");
  });

  it("stops an infinite loop", async () => {
    const started = Date.now();
    await expect(runScraperCode(page, "while (true) {}", 1_000)).rejects.toBeInstanceOf(ScraperTimeoutError);
    expect(Date.now() - started).toBeLessThan(8_000);
  });

  it("reports errors thrown by the scraper code", async () => {
    await expect(runScraperCode(page, "throw new Error('sélecteur absent')")).rejects.toThrow("Erreur dans le code du scraper : Error: sélecteur absent");
    await expect(runScraperCode(page, "result = ")).rejects.toThrow("Erreur dans le code du scraper");
  });
});

describe("network guard (real Chromium)", () => {
  it.each(["http://127.0.0.1:9/", "http://localhost/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"])("blocks %s", async (url) => {
    await guardPageRequests(page);
    await expect(page.goto(url)).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT|ERR_FAILED|ERR_ABORTED/);
  });

  it("still loads data: URLs", async () => {
    await guardPageRequests(page);
    await page.goto("data:text/html,<p>ok</p>");
    expect(await page.$eval("p", (p) => p.textContent)).toBe("ok");
  });
});
