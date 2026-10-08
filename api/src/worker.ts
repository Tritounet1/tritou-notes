import { Worker } from "bullmq";
import cronParser from "cron-parser";
import dotenv from "dotenv";
import { writeFileSync } from "node:fs";
dotenv.config();

import IORedis from "ioredis";
import puppeteer from "puppeteer-extra";
import type { Browser } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import config from "./config/config";
import { prisma } from "./config/prismaClient";
import { assertConfig } from "./config/validateConfig";
import type { Prisma } from "./generated/prisma/client";
import { guardPageRequests } from "./scraping/networkGuard";
import { runScraperCode, ScraperTimeoutError } from "./scraping/sandbox";

assertConfig("worker", {});

const connection = new IORedis({ ...config.redis, maxRetriesPerRequest: null });

puppeteer.use(StealthPlugin());

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const NAVIGATION_TIMEOUT_MS = 45_000;
// Time left for client-side rendering after the network settles (0 in tests).
const SETTLE_MS = Number(process.env.SCRAPER_SETTLE_MS ?? 3000);

// Chromium's own sandbox (user namespaces) confines a compromised renderer. In Docker it needs
// the seccomp profile docker/worker/seccomp-chromium.json. CHROMIUM_SANDBOX: "auto" (default)
// falls back to --no-sandbox with a warning when it cannot start, "required" refuses to, "off"
// never uses it.
const SANDBOX_MODE = process.env.CHROMIUM_SANDBOX ?? "auto";
let sandboxed = SANDBOX_MODE !== "off";

const launchBrowser = async (): Promise<Browser> => {
  const launch = (sandbox: boolean) =>
    puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--start-maximized", ...(sandbox ? [] : ["--no-sandbox", "--disable-setuid-sandbox"])],
    });
  if (!sandboxed) return launch(false);
  try {
    return await launch(true);
  } catch (error) {
    if (SANDBOX_MODE === "required") throw error;
    console.warn(
      "WARNING: Chromium cannot start with its sandbox (missing seccomp profile docker/worker/seccomp-chromium.json?). " +
        "Scraping continues WITHOUT it; set CHROMIUM_SANDBOX=required to refuse.",
      error,
    );
    sandboxed = false;
    return launch(false);
  }
};

const scrapeWithBrowser = async (url: string, code: string) => {
  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();

    const page = await browser.newPage();
    // Only public http(s) addresses, for the page itself, its redirects and sub-resources.
    await guardPageRequests(page);

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.setViewport({ width: 1920, height: 1080 });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: NAVIGATION_TIMEOUT_MS });
    await sleep(SETTLE_MS);

    // The scraper code runs in the page's isolated world, never in this Node process.
    const result = await runScraperCode(page, code);

    return {
      url: url,
      ...(result as Prisma.InputJsonObject | null),
    };
  } catch (error) {
    // A scraper stuck in a loop blocks its renderer: kill Chromium instead of waiting for it.
    if (error instanceof ScraperTimeoutError) browser?.process()?.kill("SIGKILL");
    // Keep the real cause: it is stored as the instance's error.
    throw error;
  } finally {
    await browser?.close().catch(() => {});
  }
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

type InstanceRow = { id: number; url: string; response: Prisma.JsonValue | null };

/** A stored response is a result unless it is an `{ error }` written by a failed run. */
const isResult = (response: Prisma.JsonValue | null) =>
  response !== null && !(typeof response === "object" && !Array.isArray(response) && "error" in response);

/** Moves the current result to the history before it is replaced (errors are archived when they happen). */
const archiveResult = async (instance: InstanceRow, schedulerId: number | null) => {
  if (!isResult(instance.response)) return;
  await prisma.instanceScrapeHistory.create({
    data: {
      url: instance.url,
      response: instance.response as Prisma.InputJsonValue,
      status: "FINISHED",
      instanceScrapeId: instance.id,
      scrapingSchedulerId: schedulerId,
    },
  });
};

/** Keeps the last good result in the history, logs the error there once, and shows it on the instance. */
const recordFailure = async (instance: InstanceRow, schedulerId: number | null, error: unknown) => {
  const response = { error: errorMessage(error) };
  try {
    await archiveResult(instance, schedulerId);
    await prisma.instanceScrapeHistory.create({
      data: { url: instance.url, response, status: "ERROR", instanceScrapeId: instance.id, scrapingSchedulerId: schedulerId },
    });
    await prisma.instanceScrape.update({ where: { id: instance.id }, data: { status: "ERROR", last_update: new Date(), response } });
  } catch (recordError) {
    console.error(`Could not record the failure of instance ${instance.id}:`, recordError);
  }
};

const scrapeInstance = async (instanceId: number, schedulerId: number | null) => {
  const instance = await prisma.instanceScrape.findFirst({ where: { id: instanceId } });
  // Deleted meanwhile: nothing to record.
  if (!instance) throw new Error(`Instance de scrape ${instanceId} introuvable.`);

  await prisma.instanceScrape.update({
    where: { id: instanceId },
    data: { status: "WORKING", last_update: new Date() },
  });
  console.log("Start scraping for instance: ", instance.id);

  try {
    const scraper = await prisma.scraper.findFirst({
      where: { base_url: { has: new URL(instance.url).origin }, status: "ACTIVE" },
    });
    if (!scraper) throw new Error("Aucun scraper actif ne couvre ce site.");

    await prisma.instanceScrape.update({ where: { id: instanceId }, data: { scraperId: scraper.id } });
    if (!scraper.code) throw new Error("Le scraper n’a pas de code.");

    const response = await scrapeWithBrowser(instance.url, scraper.code);

    await archiveResult(instance, schedulerId);
    await prisma.instanceScrape.update({
      where: { id: instanceId },
      data: { status: "FINISHED", last_update: new Date(), response },
    });
    console.log("Finish scraping for instance: ", instance.id);
  } catch (error) {
    await recordFailure(instance, schedulerId, error);
    throw error;
  }
};

const runScheduler = async (schedulerId: number) => {
  console.log("Start scheduled scraping for scheduler: ", schedulerId);
  try {
    await prisma.scrapingScheduler.update({
      where: { id: schedulerId },
      data: { status: "RUNNING", last_run_at: new Date() },
    });

    const instances = await prisma.instanceScrape.findMany({ where: { scrapingSchedulerId: schedulerId } });
    console.log(`Found ${instances.length} instances for scheduler ${schedulerId}`);

    for (const instance of instances) {
      // A failed URL is recorded on its instance; the others still run.
      await scrapeInstance(instance.id, schedulerId).catch((error) => console.log(`Error scraping instance ${instance.id}: `, errorMessage(error)));
    }

    const scheduler = await prisma.scrapingScheduler.findUnique({ where: { id: schedulerId } });
    await prisma.scrapingScheduler.update({
      where: { id: schedulerId },
      data: {
        status: "ACTIVATE",
        update_at: new Date(),
        next_run_at: scheduler?.cron_expression ? cronParser.parse(scheduler.cron_expression).next().toDate() : null,
      },
    });
    console.log("Finish scheduled scraping for scheduler: ", schedulerId);
  } catch (error) {
    await prisma.scrapingScheduler
      .update({ where: { id: schedulerId }, data: { status: "ERROR", update_at: new Date() } })
      .catch((recordError) => console.error(`Could not mark scheduler ${schedulerId} as failed:`, recordError));
    throw error;
  }
};

/**
 * A worker stopped mid-job (crash, out of memory, redeploy) leaves rows WORKING / RUNNING
 * forever. Only one worker runs, so at startup any such row is stale: mark it as failed.
 */
const recoverInterruptedWork = async () => {
  const interrupted = new Error("Interrompu : le worker s’est arrêté pendant le scrape.");
  for (const instance of await prisma.instanceScrape.findMany({ where: { status: "WORKING" } })) {
    await recordFailure(instance, instance.scrapingSchedulerId, interrupted);
  }
  await prisma.scrapingScheduler.updateMany({ where: { status: "RUNNING" }, data: { status: "ERROR", update_at: new Date() } });
};

console.log("Start worker for scraping queue.");

// Errors are rethrown so BullMQ marks the job as failed (kept in Redis, see config/queue.ts).
const worker = new Worker(
  "scrape",
  async (job) => {
    if (job.data.schedulerId) return runScheduler(job.data.schedulerId);
    if (job.data.id) return scrapeInstance(job.data.id, null);
    console.log("Unknown job type: ", job.name, job.data);
  },
  { connection, concurrency: 1, autorun: false },
);

// Liveness for the container healthcheck: written while the event loop runs (scraper code
// runs in Chromium, so a stuck scraper does not stop it).
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/worker-heartbeat";
const beat = () => {
  try {
    writeFileSync(HEARTBEAT_FILE, String(Date.now()));
  } catch (error) {
    console.error("Could not write the worker heartbeat:", error);
  }
};
beat();
setInterval(beat, 30_000).unref();

recoverInterruptedWork()
  .catch((error) => console.error("Could not recover interrupted jobs:", error))
  .finally(() => void worker.run());
