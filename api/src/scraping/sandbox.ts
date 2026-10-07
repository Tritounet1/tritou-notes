import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "puppeteer";

// Scraper code is untrusted. It runs inside the scraped page, in Puppeteer's isolated world:
// it shares the page DOM but not the page's JavaScript, and has no access to Node (process,
// require, env, files). `$` is Cheerio, bundled for the browser by scripts/build-sandbox.mjs.

export const SCRAPER_TIMEOUT_MS = 15_000;
export const MAX_RESULT_CHARS = 5_000_000;

const BUNDLE_PATH = resolve(__dirname, "../../sandbox/cheerio.browser.js");
let bundle: string | undefined;

export class ScraperTimeoutError extends Error {
  constructor(ms: number) {
    super(`Le code du scraper a dépassé ${ms / 1000} s et a été arrêté.`);
  }
}

const cheerioBundle = () => {
  if (bundle === undefined) {
    try {
      bundle = readFileSync(BUNDLE_PATH, "utf8");
    } catch {
      throw new Error("Bundle Cheerio introuvable : lancez `npm run build:sandbox` dans api/.");
    }
  }
  return bundle;
};

/**
 * The script evaluated in the page. Sloppy mode and `var result` keep the semantics of the
 * former vm context (scrapers assign `result = …`, possibly without declaring helpers).
 */
export const buildScraperScript = (code: string) =>
  [
    "(() => {",
    "const $ = globalThis.__tritouCheerio.load(document.documentElement.outerHTML);",
    "var result = null;",
    code,
    ";return JSON.stringify(result === undefined ? null : result);",
    "})()",
  ].join("\n");

interface EvaluateResponse {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

/**
 * Runs scraper code against the loaded page and returns its `result`.
 *
 * Uses the public DevTools protocol: a fresh isolated world for the main frame, then
 * `Runtime.evaluate` with a `timeout`, which terminates a runaway script inside V8.
 * A wall-clock guard (timeout + 5 s) also rejects with ScraperTimeoutError if the renderer
 * stops answering; the caller must then kill the browser.
 */
export const runScraperCode = async (page: Page, code: string, timeoutMs = SCRAPER_TIMEOUT_MS): Promise<unknown> => {
  const session = await page.createCDPSession();
  try {
    const { frameTree } = await session.send("Page.getFrameTree");
    const { executionContextId } = await session.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "tritou-scraper" });
    const evaluate = async (expression: string, timeout: number) => {
      let response: EvaluateResponse;
      try {
        response = (await session.send("Runtime.evaluate", { expression, contextId: executionContextId, returnByValue: true, timeout })) as EvaluateResponse;
      } catch (error) {
        // Chrome reports the V8 termination as a protocol error; the page stays usable.
        if (error instanceof Error && /terminated/i.test(error.message)) throw new ScraperTimeoutError(timeout);
        throw error;
      }
      if (response.exceptionDetails) {
        const message = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Erreur inconnue";
        // V8 reports a terminated script as an "Execution was terminated" exception.
        if (/terminated/i.test(message)) throw new ScraperTimeoutError(timeout);
        throw new Error(`Erreur dans le code du scraper : ${message.split("\n")[0]}`);
      }
      return response.result?.value;
    };

    await evaluate(cheerioBundle(), timeoutMs);
    const json = await new Promise<unknown>((resolveValue, reject) => {
      const guard = setTimeout(() => reject(new ScraperTimeoutError(timeoutMs)), timeoutMs + 5_000);
      evaluate(buildScraperScript(code), timeoutMs).then(
        (value) => {
          clearTimeout(guard);
          resolveValue(value);
        },
        (error) => {
          clearTimeout(guard);
          reject(error);
        },
      );
    });
    if (typeof json !== "string") throw new Error("Le scraper n’a pas renvoyé de résultat sérialisable.");
    if (json.length > MAX_RESULT_CHARS) throw new Error(`Résultat trop volumineux (${json.length} caractères, ${MAX_RESULT_CHARS} max).`);
    return JSON.parse(json);
  } finally {
    await session.detach().catch(() => {});
  }
};
