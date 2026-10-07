import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => {
  process.env.SCRAPER_SETTLE_MS = "0";
  return { process: undefined as undefined | ((job: { name: string; data: { id?: number; schedulerId?: number } }) => Promise<void>), run: vi.fn(), launch: vi.fn(), close: vi.fn(), kill: vi.fn(), guard: vi.fn(), runCode: vi.fn(), html: "<h1>Price</h1>", page: { setUserAgent: vi.fn(), setViewport: vi.fn(), setExtraHTTPHeaders: vi.fn(), goto: vi.fn() } };
});
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("ioredis", () => ({ default: class {} }));
vi.mock("puppeteer-extra-plugin-stealth", () => ({ default: vi.fn() }));
vi.mock("puppeteer-extra", () => ({ default: { use: vi.fn(), launch: mocks.launch } }));
vi.mock("bullmq", () => ({ Worker: class { constructor(_name: string, process: typeof mocks.process) { mocks.process = process; } run = mocks.run; } }));
// The real sandbox runs in Chromium (see integration/scraperSandbox.test.ts); here a Node double keeps the same contract.
vi.mock("../scraping/networkGuard", () => ({ guardPageRequests: mocks.guard }));
vi.mock("../scraping/sandbox", async () => {
  const cheerio = await import("cheerio");
  const vm = await import("node:vm");
  class ScraperTimeoutError extends Error {}
  mocks.runCode.mockImplementation(async (_page: unknown, code: string) => {
    const context = { $: cheerio.load(mocks.html), result: null };
    vm.runInNewContext(code, context);
    return context.result;
  });
  return { runScraperCode: mocks.runCode, ScraperTimeoutError };
});
beforeAll(async () => {
  resetDatabase();
  await import("../worker");
});

const instance = { id: 12, url: "https://example.com/page", response: null, status: "IN_QUEUE", scrapingSchedulerId: 3 };
async function run(data: { id?: number; schedulerId?: number }) { await mocks.process!({ name: "test", data }); }
beforeEach(() => {
  vi.clearAllMocks();
  resetDatabase();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.launch.mockReset().mockResolvedValue({ newPage: async () => mocks.page, close: mocks.close, process: () => ({ kill: mocks.kill }) });
  mocks.page.goto.mockReset().mockResolvedValue(undefined);
  mocks.html = "<h1>Price</h1>";
  mocks.close.mockReset().mockResolvedValue(undefined);
  db.instanceScrape.findFirst.mockResolvedValue(instance);
  db.scraper.findFirst.mockResolvedValue({ id: 4, code: 'result = { title: $("h1").text() }' });
  db.scrapingScheduler.findUnique.mockResolvedValue({ cron_expression: "0 * * * *" });
});
afterEach(() => vi.restoreAllMocks());

describe("scraping worker", () => {
  it("executes scraper code, persists extracted data and closes Chromium", async () => {
    await run({ id: 12 });
    expect(db.scraper.findFirst).toHaveBeenCalledWith({ where: { base_url: { has: "https://example.com" }, status: "ACTIVE" } });
    expect(db.instanceScrape.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { status: "WORKING", last_update: expect.any(Date) } });
    expect(db.instanceScrape.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { status: "FINISHED", last_update: expect.any(Date), response: { url: instance.url, title: "Price" } } });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(db.instanceScrapeHistory.create).not.toHaveBeenCalled();
    // Requests are filtered before navigating, and the code runs through the sandbox.
    expect(mocks.guard).toHaveBeenCalledWith(mocks.page);
    expect(mocks.guard.mock.invocationCallOrder[0]).toBeLessThan(mocks.page.goto.mock.invocationCallOrder[0]);
    expect(mocks.page.goto).toHaveBeenCalledWith(instance.url, { waitUntil: "networkidle2", timeout: 45_000 });
    expect(mocks.runCode).toHaveBeenCalledWith(mocks.page, 'result = { title: $("h1").text() }');
  });
  it("kills Chromium when the scraper code times out and stores the real cause", async () => {
    const { ScraperTimeoutError } = await import("../scraping/sandbox");
    mocks.runCode.mockRejectedValueOnce(Object.assign(new ScraperTimeoutError(15_000), { message: "Le code du scraper a dépassé 15 s et a été arrêté." }));
    await expect(run({ id: 12 })).rejects.toThrow("15 s");
    expect(mocks.kill).toHaveBeenCalledWith("SIGKILL");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(db.instanceScrape.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { status: "ERROR", last_update: expect.any(Date), response: { error: expect.stringContaining("15 s") } } });
  });
  it("archives the previous result on repeated scraping", async () => {
    db.instanceScrape.findFirst.mockResolvedValue({ ...instance, response: { title: "Old" }, status: "FINISHED" });
    await run({ id: 12 });
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: { url: instance.url, response: { title: "Old" }, status: "FINISHED", instanceScrapeId: 12, scrapingSchedulerId: null } });
  });
  it.each(["missing scraper", "missing code", "invalid URL", "navigation failure", "invalid code", "launch failure"])("records an ERROR for %s", async failure => {
    if (failure === "missing scraper") db.scraper.findFirst.mockResolvedValue(null);
    if (failure === "missing code") db.scraper.findFirst.mockResolvedValue({ id: 4, code: null });
    if (failure === "invalid URL") db.instanceScrape.findFirst.mockResolvedValue({ ...instance, url: "invalid" });
    if (failure === "navigation failure") mocks.page.goto.mockRejectedValue(new Error("timeout"));
    if (failure === "invalid code") db.scraper.findFirst.mockResolvedValue({ id: 4, code: "throw new Error('bad code')" });
    if (failure === "launch failure") mocks.launch.mockRejectedValue(new Error("launch failed"));
    // The job fails for BullMQ too.
    await expect(run({ id: 12 })).rejects.toThrow();
    expect(db.instanceScrape.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { status: "ERROR", last_update: expect.any(Date), response: { error: expect.any(String) } } });
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "ERROR", instanceScrapeId: 12 }) });
    if (["navigation failure", "invalid code"].includes(failure)) expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("keeps the last good result in the history when a run fails, and logs the error once", async () => {
    db.instanceScrape.findFirst.mockResolvedValue({ ...instance, response: { title: "Good" }, status: "FINISHED" });
    db.scraper.findFirst.mockResolvedValue(null);
    await expect(run({ id: 12 })).rejects.toThrow("Aucun scraper actif");
    expect(db.instanceScrapeHistory.create.mock.calls.map(([{ data }]) => [data.status, data.response])).toEqual([
      ["FINISHED", { title: "Good" }],
      ["ERROR", { error: "Aucun scraper actif ne couvre ce site." }],
    ]);

    // The next success does not archive the error a second time.
    db.instanceScrapeHistory.create.mockClear();
    db.instanceScrape.findFirst.mockResolvedValue({ ...instance, response: { error: "Aucun scraper actif ne couvre ce site." }, status: "ERROR" });
    db.scraper.findFirst.mockResolvedValue({ id: 4, code: 'result = { title: $("h1").text() }' });
    await run({ id: 12 });
    expect(db.instanceScrapeHistory.create).not.toHaveBeenCalled();
  });
  it("still fails the job when the failure cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.scraper.findFirst.mockResolvedValue(null);
    db.instanceScrapeHistory.create.mockRejectedValue(new Error("db down"));
    await expect(run({ id: 12 })).rejects.toThrow("Aucun scraper actif");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("instance 12"), expect.any(Error));
  });
  it("handles a removed instance without writing an orphan history", async () => {
    db.instanceScrape.findFirst.mockResolvedValue(null);
    await expect(run({ id: 12 })).rejects.toThrow("introuvable");
    expect(db.instanceScrapeHistory.create).not.toHaveBeenCalled();
    expect(db.instanceScrape.update).not.toHaveBeenCalled();
  });
  it("runs a scheduler, preserves previous results, and sets the next run", async () => {
    db.instanceScrape.findMany.mockResolvedValue([instance]);
    db.instanceScrape.findFirst.mockResolvedValue({ ...instance, response: { title: "Old" } });
    await run({ schedulerId: 3 });
    expect(db.scrapingScheduler.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: "RUNNING", last_run_at: expect.any(Date) } });
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ scrapingSchedulerId: 3 }) });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: "ACTIVATE", update_at: expect.any(Date), next_run_at: expect.any(Date) } });
  });
  it("continues with other instances when one scrape fails", async () => {
    db.instanceScrape.findMany.mockResolvedValue([instance, { ...instance, id: 13 }]);
    db.scraper.findFirst.mockResolvedValueOnce(null);
    await run({ schedulerId: 3 });
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "ERROR", scrapingSchedulerId: 3 }) });
    expect(db.instanceScrape.update).toHaveBeenCalledWith({ where: { id: 13 }, data: expect.objectContaining({ status: "FINISHED" }) });
  });
  it("allows an empty scheduler without a cron expression", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(null);
    await run({ schedulerId: 3 });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: "ACTIVATE", update_at: expect.any(Date), next_run_at: null } });
  });
  it("marks a scheduler ERROR on a database failure", async () => {
    db.instanceScrape.findMany.mockRejectedValue(new Error("offline"));
    await expect(run({ schedulerId: 3 })).rejects.toThrow("offline");
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: "ERROR", update_at: expect.any(Date) } });

    vi.spyOn(console, "error").mockImplementation(() => {});
    db.scrapingScheduler.update.mockRejectedValue(new Error("offline"));
    await expect(run({ schedulerId: 3 })).rejects.toThrow("offline");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("scheduler 3"), expect.any(Error));
  });
  it("ignores jobs with no supported payload", async () => {
    await run({});
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(db.instanceScrape.update).not.toHaveBeenCalled();
  });
});

describe("worker startup", () => {
  const start = async () => {
    vi.resetModules();
    mocks.run.mockClear();
    await import("../worker");
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
  };

  it("marks rows left WORKING / RUNNING by a stopped worker as failed before taking jobs", async () => {
    db.instanceScrape.findMany.mockResolvedValue([{ ...instance, status: "WORKING", response: { title: "Good" } }]);
    await start();
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "FINISHED", response: { title: "Good" }, scrapingSchedulerId: 3 }) });
    expect(db.instanceScrape.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { status: "ERROR", last_update: expect.any(Date), response: { error: expect.stringContaining("Interrompu") } } });
    expect(db.instanceScrape.findMany).toHaveBeenCalledWith({ where: { status: "WORKING" } });
    expect(db.scrapingScheduler.updateMany).toHaveBeenCalledWith({ where: { status: "RUNNING" }, data: { status: "ERROR", update_at: expect.any(Date) } });
    expect(db.scrapingScheduler.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.run.mock.invocationCallOrder[0]);
  });

  it("starts anyway when the recovery fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.instanceScrape.findMany.mockRejectedValue(new Error("db down"));
    await start();
    expect(console.error).toHaveBeenCalledWith("Could not recover interrupted jobs:", expect.any(Error));
  });
});
