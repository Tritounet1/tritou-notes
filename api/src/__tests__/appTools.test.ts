import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const queue = vi.hoisted(() => ({ add: vi.fn(), getRepeatableJobs: vi.fn(), removeRepeatableByKey: vi.fn() }));
vi.mock("../config/queue", () => ({ scrapeQueue: queue }));
vi.mock("../utils/documentImageStorage", () => ({ removeDocumentImages: vi.fn().mockResolvedValue(undefined) }));
import { runTool, toolDefinitions, type ToolContext } from "../ai/tools";
import { updateScheduler } from "../services/schedulerService";

const admin = (): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set() });
const user = (permissions: Record<string, boolean>): ToolContext => ({ userId: 8, isAdmin: false, permissions: permissions as never, changed: new Set() });
const run = (name: string, args: object, ctx = admin()) => runTool(name, JSON.stringify(args), ctx);

beforeEach(() => {
  resetDatabase();
  queue.add.mockReset();
  queue.getRepeatableJobs.mockReset().mockResolvedValue([]);
  queue.removeRepeatableByKey.mockReset();
});

describe("tool catalogue", () => {
  it("covers the whole app with unique names", () => {
    const names = toolDefinitions.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ["update_scheduler", "add_scheduler_url", "create_scraper", "run_scrape", "wait_for_instance", "create_folder", "delete_page", "update_user_permissions"]) {
      expect(names).toContain(name);
    }
  });
});

describe("schedulers", () => {
  const scheduler = { id: 1, title: "Test", description: null, status: "DESACTIVATE", cron_expression: null, start_at: null };

  it("does what the screenshot asked: URL, daily cron, description, activation", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(scheduler);
    db.scrapingScheduler.findFirst.mockResolvedValue(scheduler);
    db.scrapingScheduler.update.mockImplementation(async ({ data }) => ({ ...scheduler, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }));
    db.scraper.findFirst.mockResolvedValue({ name: "Amazon" });

    expect(await run("add_scheduler_url", { id: 1, url: "https://www.amazon.fr/dp/B0FQFQLTDD?ref_=x" })).toMatchObject({ ok: true });
    expect(db.instanceScrape.create).toHaveBeenCalledWith({ data: { url: "https://www.amazon.fr/dp/B0FQFQLTDD?ref_=x", scrapingSchedulerId: 1, scraperId: undefined } });
    expect(queue.add).not.toHaveBeenCalled(); // scheduler URLs wait for the scheduler

    const result = await run("update_scheduler", { id: 1, description: "Prix Apple Watch", cron_expression: "0 0 * * *", status: "ACTIVATE" });
    expect(result).toMatchObject({ ok: true, summary: "Planificateur modifié : « Test » (description, cron, statut)" });
    expect(queue.add).toHaveBeenCalledWith("scheduler-1", { schedulerId: 1 }, { repeat: { pattern: "0 0 * * *" }, jobId: "scheduler-1" });
  });

  it("refuses an invalid cron and activation without cron", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(scheduler);
    db.scrapingScheduler.findFirst.mockResolvedValue(scheduler);
    expect(await run("update_scheduler", { id: 1, cron_expression: "tous les jours" })).toMatchObject({ ok: false });
    expect(await run("update_scheduler", { id: 1, status: "ACTIVATE" })).toMatchObject({ ok: false, summary: expect.stringContaining("cron") });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("needs modifyScraperStatus", async () => {
    expect(await run("update_scheduler", { id: 1, title: "x" }, user({ accessScrapersPage: true }))).toMatchObject({ ok: false });
    expect(db.scrapingScheduler.update).not.toHaveBeenCalled();
  });
});

describe("scheduler service fixes", () => {
  it("reschedules an active scheduler when its cron changes", async () => {
    const active = { id: 2, status: "ACTIVATE", cron_expression: "0 * * * *", start_at: new Date(0) };
    db.scrapingScheduler.findFirst.mockResolvedValue(active);
    db.scrapingScheduler.update.mockResolvedValue({ ...active, cron_expression: "0 8 * * *" });
    queue.getRepeatableJobs.mockResolvedValue([{ name: "scheduler-2", key: "old-key" }]);
    await updateScheduler(2, 7, { cron_expression: "0 8 * * *" });
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("old-key");
    expect(queue.add).toHaveBeenCalledWith("scheduler-2", { schedulerId: 2 }, { repeat: { pattern: "0 8 * * *" }, jobId: "scheduler-2" });
  });

  it("stops the job of a scheduler deactivated while in ERROR", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ id: 3, status: "ERROR", cron_expression: "0 * * * *" });
    db.scrapingScheduler.update.mockResolvedValue({ id: 3, status: "DESACTIVATE", cron_expression: "0 * * * *" });
    queue.getRepeatableJobs.mockResolvedValue([{ name: "scheduler-3", key: "k3" }]);
    await updateScheduler(3, 7, { status: "DESACTIVATE" });
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("k3");
  });

  it("removes the repeatable job when a scheduler is deleted", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue({ id: 4, title: "Old" });
    queue.getRepeatableJobs.mockResolvedValue([{ name: "scheduler-4", key: "k4" }]);
    expect(await run("delete_scheduler", { id: 4 })).toMatchObject({ ok: true });
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith("k4");
    expect(db.scrapingScheduler.delete).toHaveBeenCalledWith({ where: { id: 4 } });
  });
});

describe("scrapers and instances", () => {
  it("creates a scraper with origins and a normalised display template", async () => {
    db.scraper.create.mockImplementation(async ({ data }) => ({ id: 5, status: "DISABLE", ...data }));
    await run("create_scraper", { name: "Amazon", base_url: ["https://www.amazon.fr/dp/X?y=1", "https://www.amazon.fr/"], code: "result = {};", display_template: [{ type: "title", field: "title" }] });
    const { data } = db.scraper.create.mock.calls[0][0];
    expect(data.base_url).toEqual(["https://www.amazon.fr"]);
    expect(data.display_template[0]).toMatchObject({ type: "title", field: "title", id: expect.any(String) });
    expect(await run("create_scraper", { name: "X", display_template: [{ type: "video", field: "v" }] })).toMatchObject({ ok: false });
  });

  it("runs a scrape only when an active scraper covers the site", async () => {
    db.scraper.findFirst.mockResolvedValueOnce(null);
    expect(await run("run_scrape", { url: "https://unknown.example/page" })).toMatchObject({ ok: false });
    db.scraper.findFirst.mockResolvedValueOnce({ id: 5, name: "Amazon" });
    db.instanceScrape.create.mockResolvedValue({ id: 33 });
    expect(await run("run_scrape", { url: "https://www.amazon.fr/dp/X" })).toMatchObject({ ok: true, output: { instanceId: 33 } });
    expect(queue.add).toHaveBeenCalledWith("scrape-url", { id: 33 });
  });

  it("waits for an instance to finish", async () => {
    db.instanceScrape.findUnique.mockResolvedValueOnce({ id: 33, status: "WORKING" }).mockResolvedValueOnce({ id: 33, status: "FINISHED", response: { price: 9 } });
    vi.useFakeTimers();
    const pending = run("wait_for_instance", { id: 33, seconds: 10 });
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect(await pending).toMatchObject({ ok: true, output: { status: "FINISHED", response: { price: 9 } } });
  });
});

describe("workspace", () => {
  it("deletes a page with its sub-pages", async () => {
    db.document.findUnique.mockResolvedValue({ id: 10, title: "Vieux" });
    db.document.findMany.mockResolvedValueOnce([{ id: 11 }]).mockResolvedValueOnce([]);
    const ctx = admin();
    expect(await run("delete_page", { id: 10 }, ctx)).toMatchObject({ ok: true, summary: "Page supprimée : « Vieux » (+ 1 sous-page)" });
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect([...ctx.changed]).toEqual([10, 11]);
  });

  it("keeps user management for administrators", async () => {
    expect(await run("list_users", {}, user({ modifyDocument: true }))).toMatchObject({ ok: false });
    db.user.findUnique.mockResolvedValue({ username: "camille", role: "USER" });
    expect(await run("update_user_permissions", { userId: 8, permissions: { useAiChatBot: true, hacker: true } })).toMatchObject({ ok: false });
    expect(await run("update_user_permissions", { userId: 8, permissions: { useAiChatBot: true } })).toMatchObject({ ok: true });
    expect(db.userPermissions.upsert).toHaveBeenCalledWith({ where: { userId: 8 }, update: { useAiChatBot: true }, create: { userId: 8, useAiChatBot: true } });
  });

  it("flags folder changes so the sidebar refreshes", async () => {
    db.folder.create.mockResolvedValue({ id: 3, name: "Projets" });
    const ctx = admin();
    expect(await run("create_folder", { name: "Projets" }, ctx)).toMatchObject({ ok: true });
    expect(ctx.treeChanged).toBe(true);
  });
});
