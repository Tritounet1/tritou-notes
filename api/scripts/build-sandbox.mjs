// Bundles Cheerio for the browser: the worker injects it into the isolated world of the
// scraped page, where scraper code runs with the same `$` API, without access to Node.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

await build({
  stdin: {
    contents: 'import { load } from "cheerio"; globalThis.__tritouCheerio = { load };',
    resolveDir: root,
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  minify: true,
  legalComments: "none",
  outfile: `${root}sandbox/cheerio.browser.js`,
  logLevel: "warning",
});
