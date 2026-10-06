import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ process: undefined as undefined | ((job: { name: string; data: { id?: number; schedulerId?: number } }) => Promise<void>), launch: vi.fn(), close: vi.fn(), page: { setUserAgent: vi.fn(), setViewport: vi.fn(), setExtraHTTPHeaders: vi.fn(), goto: vi.fn(), content: vi.fn() } }));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("ioredis", () => ({ default: class {} }));
vi.mock("puppeteer-extra-plugin-stealth", () => ({ default: vi.fn() }));
vi.mock("puppeteer-extra", () => ({ default: { use: vi.fn(), launch: mocks.launch } }));
vi.mock("bullmq", () => ({ Worker: class { constructor(_name: string, process: typeof mocks.process) { mocks.process = process; } } }));
import "../worker";

const instance = { id: 12, url: "https://example.com/page", response: null, status: "IN_QUEUE", scrapingSchedulerId: 3 };
async function run(data: { id?: number; schedulerId?: number }) { await mocks.process!({ name: "test", data }); }
beforeEach(() => {
  vi.clearAllMocks();
  resetDatabase();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.launch.mockReset().mockResolvedValue({ newPage: async () => mocks.page, close: mocks.close });
  mocks.page.goto.mockReset().mockResolvedValue(undefined);
  mocks.page.content.mockResolvedValue("<h1>Price</h1>");
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
    await run({ id: 12 });
    expect(db.instanceScrape.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { status: "ERROR", last_update: expect.any(Date), response: { error: expect.any(String) } } });
    expect(db.instanceScrapeHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "ERROR", instanceScrapeId: 12 }) });
    if (["navigation failure", "invalid code"].includes(failure)) expect(mocks.close).toHaveBeenCalledOnce();
  });
  it("handles a removed instance without writing an orphan history", async () => {
    db.instanceScrape.findFirst.mockResolvedValue(null);
    await run({ id: 12 });
    expect(db.instanceScrapeHistory.create).not.toHaveBeenCalled();
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
    await run({ schedulerId: 3 });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: "ERROR", update_at: expect.any(Date) } });
  });
  it("ignores jobs with no supported payload", async () => {
    await run({});
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(db.instanceScrape.update).not.toHaveBeenCalled();
  });
});
