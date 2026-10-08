import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const queue = vi.hoisted(() => ({ upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn(), getJobSchedulers: vi.fn(), add: vi.fn() }));
vi.mock("../config/queue", () => ({ scrapeQueue: queue }));
vi.mock("../utils/documentImageStorage", () => ({ removeDocumentImages: vi.fn().mockResolvedValue(undefined) }));
import { runTool, type ToolContext } from "../ai/tools";

const admin = (): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set() });
const user = (permissions: Record<string, boolean>): ToolContext => ({ userId: 8, isAdmin: false, permissions: permissions as never, changed: new Set() });
const run = (name: string, args: object, ctx = admin()) => runTool(name, JSON.stringify(args), ctx);

beforeEach(() => {
  resetDatabase();
  queue.add.mockReset();
  queue.upsertJobScheduler.mockReset();
  queue.removeJobScheduler.mockReset();
  queue.getJobSchedulers.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("scraper tools", () => {
  it("lists scrapers ordered by name, behind accessScrapersPage", async () => {
    expect(await run("list_scrapers", {}, user({}))).toMatchObject({ ok: false, summary: "Échec de list_scrapers : Permission « accessScrapersPage » manquante pour cet utilisateur." });
    expect(db.scraper.findMany).not.toHaveBeenCalled();

    db.scraper.findMany.mockResolvedValue([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
    expect(await run("list_scrapers", {}, user({ accessScrapersPage: true }))).toMatchObject({ ok: true, summary: "2 scrapers listés", output: [{ id: 1 }, { id: 2 }] });
    expect(db.scraper.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { name: "asc" } }));

    db.scraper.findMany.mockResolvedValue([{ id: 1, name: "A" }]);
    expect(await run("list_scrapers", {})).toMatchObject({ summary: "1 scraper listé" });
  });

  it("reads a scraper and rejects invalid or unknown ids", async () => {
    db.scraper.findUnique.mockResolvedValue({ id: 4, name: "Amazon", code: "result = {};" });
    expect(await run("read_scraper", { id: 4 })).toMatchObject({ ok: true, summary: "Scraper lu : « Amazon »", output: { code: "result = {};" } });
    expect(db.scraper.findUnique).toHaveBeenCalledWith({ where: { id: 4 } });

    expect(await run("read_scraper", { id: "abc" })).toMatchObject({ ok: false, summary: "Échec de read_scraper : Identifiant de scraper invalide." });
    expect(await run("read_scraper", { id: 0 })).toMatchObject({ ok: false, summary: expect.stringContaining("invalide") });
    expect(await run("read_scraper", { id: 1.5 })).toMatchObject({ ok: false, summary: expect.stringContaining("invalide") });

    db.scraper.findUnique.mockResolvedValue(null);
    expect(await run("read_scraper", { id: 99 })).toMatchObject({ ok: false, summary: "Échec de read_scraper : Le scraper 99 n’existe pas." });
  });

  it("creates a scraper with every field validated and normalised", async () => {
    db.scraper.create.mockImplementation(async ({ data }) => ({ id: 5, status: "DISABLE", ...data }));
    const result = await run("create_scraper", {
      name: "Shop",
      description: null,
      code: "",
      browser: 1,
      base_url: ["https://shop.example/a?b=1", "https://shop.example/", "http://other.example:8080/x"],
      display_template: [
        { id: "keep-me", type: "title", field: "title", label: "Titre" },
        { id: "", type: "image", field: "img", label: "" },
      ],
      status: "ACTIVE",
    });
    expect(result).toMatchObject({ ok: true, summary: "Scraper créé : « Shop »", output: { id: 5, status: "ACTIVE" } });
    const { data } = db.scraper.create.mock.calls[0][0];
    expect(data).toMatchObject({ name: "Shop", description: "", code: "", browser: true, status: "ACTIVE", base_url: ["https://shop.example", "http://other.example:8080"] });
    expect(data.display_template[0]).toEqual({ id: "keep-me", type: "title", field: "title", label: "Titre" });
    expect(data.display_template[1]).toEqual({ id: expect.any(String), type: "image", field: "img" });
    expect(data.display_template[1].id).not.toBe("");
  });

  it("requires a name and modifyScraper to create", async () => {
    expect(await run("create_scraper", { name: "X" }, user({ accessScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("modifyScraper") });
    expect(await run("create_scraper", { name: "   " })).toMatchObject({ ok: false, summary: "Échec de create_scraper : Paramètre « name » manquant." });
    expect(await run("create_scraper", {})).toMatchObject({ ok: false, summary: expect.stringContaining("« name »") });
    expect(db.scraper.create).not.toHaveBeenCalled();
  });

  it("rejects malformed base URLs, templates and code", async () => {
    expect(await run("create_scraper", { name: "X", base_url: "https://a.example" })).toMatchObject({ ok: false, summary: expect.stringContaining("`base_url` doit être une liste") });
    expect(await run("create_scraper", { name: "X", base_url: ["pas une url"] })).toMatchObject({ ok: false, summary: expect.stringContaining("URL invalide : pas une url") });
    expect(await run("create_scraper", { name: "X", display_template: {} })).toMatchObject({ ok: false, summary: expect.stringContaining("`display_template` doit être une liste") });
    expect(await run("create_scraper", { name: "X", display_template: [null] })).toMatchObject({ ok: false, summary: expect.stringContaining("Type de bloc inconnu : undefined") });
    expect(await run("create_scraper", { name: "X", display_template: [{ type: "text" }] })).toMatchObject({ ok: false, summary: expect.stringContaining("« field »") });
    expect(await run("create_scraper", { name: "X", code: 42 })).toMatchObject({ ok: false, summary: expect.stringContaining("« code »") });
    expect(db.scraper.create).not.toHaveBeenCalled();
  });

  it("updates only the given fields and lists them in the summary", async () => {
    db.scraper.findUnique.mockResolvedValue({ id: 4, name: "Old" });
    db.scraper.update.mockImplementation(async ({ data }) => ({ id: 4, name: "Old", status: "DISABLE", base_url: [], ...data }));
    expect(await run("update_scraper", { id: 4, status: "active" })).toMatchObject({ ok: false, summary: expect.stringContaining("ACTIVE ou DISABLE") });
    expect(db.scraper.update).not.toHaveBeenCalled();
    const result = await run("update_scraper", { id: 4, status: "DISABLE", base_url: ["https://x.example/path"] });
    expect(result).toMatchObject({ ok: true, summary: "Scraper modifié : « Old » (sites, statut)", output: { ok: true, status: "DISABLE", base_url: ["https://x.example"] } });
    const { where, data } = db.scraper.update.mock.calls[0][0];
    expect(where).toEqual({ id: 4 });
    expect(data).toEqual({ status: "DISABLE", base_url: ["https://x.example"], last_update: expect.any(Date) });

    db.scraper.update.mockClear();
    expect(await run("update_scraper", { id: 4 })).toMatchObject({ ok: true, summary: "Scraper modifié : « Old »" });
    expect(db.scraper.update.mock.calls[0][0].data).toEqual({ last_update: expect.any(Date) });

    db.scraper.update.mockResolvedValue({ id: 4, name: "", status: "ACTIVE", base_url: [] });
    expect(await run("update_scraper", { id: 4, name: "New", description: "d", code: "c", browser: false, display_template: [] })).toMatchObject({
      summary: "Scraper modifié : « Sans titre » (nom, description, code, navigateur, template)",
    });
  });

  it("lets only admins write scraper code", async () => {
    const editor = user({ modifyScraper: true });
    expect(await run("create_scraper", { name: "X", code: "result = 1" }, editor)).toMatchObject({ ok: false, summary: expect.stringContaining("Réservé aux administrateurs") });
    expect(db.scraper.create).not.toHaveBeenCalled();
    db.scraper.create.mockResolvedValue({ id: 5, name: "X", status: "DISABLE" });
    expect(await run("create_scraper", { name: "X", code: "" }, editor)).toMatchObject({ ok: true });

    db.scraper.findUnique.mockResolvedValue({ id: 4, name: "Old", code: "result = 1" });
    db.scraper.update.mockResolvedValue({ id: 4, name: "Old", status: "DISABLE", base_url: [] });
    expect(await run("update_scraper", { id: 4, code: "result = 2" }, editor)).toMatchObject({ ok: false, summary: expect.stringContaining("Réservé aux administrateurs") });
    expect(db.scraper.update).not.toHaveBeenCalled();
    expect(await run("update_scraper", { id: 4, name: "New", code: "result = 1" }, editor)).toMatchObject({ ok: true });
    db.scraper.findUnique.mockResolvedValue({ id: 4, name: "Old", code: null });
    expect(await run("update_scraper", { id: 4, code: "" }, editor)).toMatchObject({ ok: true });
  });

  it("refuses internal addresses as base URLs", async () => {
    expect(await run("create_scraper", { name: "X", base_url: ["http://localhost:3000"] })).toMatchObject({ ok: false, summary: expect.stringContaining("adresses http(s) publiques") });
    expect(db.scraper.create).not.toHaveBeenCalled();
  });

  it("refuses to update a missing scraper or without permission", async () => {
    db.scraper.findUnique.mockResolvedValue(null);
    expect(await run("update_scraper", { id: 3, name: "x" })).toMatchObject({ ok: false, summary: expect.stringContaining("Le scraper 3 n’existe pas") });
    expect(await run("update_scraper", { id: 3, name: "x" }, user({ accessScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("modifyScraper") });
    expect(db.scraper.update).not.toHaveBeenCalled();
  });

  it("deletes a scraper with deleteScraper only", async () => {
    db.scraper.findUnique.mockResolvedValue({ id: 4, name: "Old" });
    expect(await run("delete_scraper", { id: 4 }, user({ modifyScraper: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("deleteScraper") });
    expect(db.scraper.delete).not.toHaveBeenCalled();
    expect(await run("delete_scraper", { id: 4 }, user({ deleteScraper: true }))).toMatchObject({ ok: true, summary: "Scraper supprimé : « Old »" });
    expect(db.scraper.delete).toHaveBeenCalledWith({ where: { id: 4 } });
  });
});

describe("scheduler tools", () => {
  const scheduler = { id: 1, title: "Veille", description: null, status: "DESACTIVATE", cron_expression: null, start_at: null };

  it("lists schedulers with their URL count", async () => {
    db.scrapingScheduler.findMany.mockResolvedValue([
      { id: 1, title: "A", _count: { InstanceScrapes: 3 } },
      { id: 2, title: "B", _count: { InstanceScrapes: 0 } },
    ]);
    expect(await run("list_schedulers", {})).toEqual({ ok: true, summary: "2 planificateurs listés", output: [{ id: 1, title: "A", urls: 3 }, { id: 2, title: "B", urls: 0 }] });
    db.scrapingScheduler.findMany.mockResolvedValue([]);
    expect(await run("list_schedulers", {})).toMatchObject({ summary: "0 planificateur listé" });
    expect(await run("list_schedulers", {}, user({}))).toMatchObject({ ok: false });
  });

  it("reads a scheduler with its URLs", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue({ ...scheduler, InstanceScrapes: [{ id: 9, url: "https://a.example/" }] });
    const result = await run("read_scheduler", { id: 1 });
    expect(result).toMatchObject({ ok: true, summary: "Planificateur lu : « Veille »", output: { id: 1, urls: [{ id: 9 }] } });
    expect(result.output).not.toHaveProperty("InstanceScrapes");

    db.scrapingScheduler.findUnique.mockResolvedValue(null);
    expect(await run("read_scheduler", { id: 2 })).toMatchObject({ ok: false, summary: expect.stringContaining("Le planificateur 2 n’existe pas") });
    expect(await run("read_scheduler", { id: -1 })).toMatchObject({ ok: false, summary: expect.stringContaining("Identifiant de planificateur invalide") });
  });

  it("creates a scheduler with URLs, cron and activation", async () => {
    db.scrapingScheduler.create.mockResolvedValue({ id: 1 });
    db.scrapingScheduler.findFirst.mockResolvedValue(scheduler);
    db.scrapingScheduler.update.mockResolvedValue({ ...scheduler, status: "ACTIVATE", cron_expression: "0 0 * * *" });
    const result = await run("create_scheduler", { title: "Veille", description: "prix", urls: [" https://a.example/x "], cron_expression: " 0 0 * * * ", activate: true });
    expect(result).toEqual({ ok: true, summary: "Planificateur créé : « Veille » (activé)", output: { id: 1, urls: 1, cron_expression: "0 0 * * *", status: "ACTIVATE" } });
    // Scheduler and its URLs in a single write.
    expect(db.scrapingScheduler.create).toHaveBeenCalledWith({ data: { title: "Veille", description: "prix", InstanceScrapes: { create: [{ url: "https://a.example/x" }] } } });
    expect(db.instanceScrape.create).not.toHaveBeenCalled();
    expect(db.scrapingScheduler.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { title: undefined, description: undefined, status: "ACTIVATE", cron_expression: "0 0 * * *" } });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith("scheduler-1", { pattern: "0 0 * * *", tz: "UTC" }, { name: "scheduler-1", data: { schedulerId: 1 } });
  });

  it("rolls the scheduler back when scheduling fails", async () => {
    db.scrapingScheduler.create.mockResolvedValue({ id: 5 });
    db.scrapingScheduler.findFirst.mockResolvedValue({ ...scheduler, id: 5 });
    db.user.findFirst.mockResolvedValue(null); // updateScheduler fails: author missing
    const result = await run("create_scheduler", { title: "Cassé", urls: ["https://a.example/x"], cron_expression: "0 0 * * *", activate: true });
    expect(result).toMatchObject({ ok: false, summary: expect.stringContaining("Utilisateur introuvable") });
    expect(db.instanceScrape.deleteMany).toHaveBeenCalledWith({ where: { scrapingSchedulerId: 5 } });
    expect(db.scrapingScheduler.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("creates a bare scheduler without touching the queue", async () => {
    db.scrapingScheduler.create.mockResolvedValue({ id: 2 });
    expect(await run("create_scheduler", { title: "Seul", cron_expression: "  " })).toEqual({
      ok: true, summary: "Planificateur créé : « Seul »", output: { id: 2, urls: 0, cron_expression: null, status: "DESACTIVATE" },
    });
    expect(db.scrapingScheduler.create).toHaveBeenCalledWith({ data: { title: "Seul", description: null } });
    expect(db.scrapingScheduler.update).not.toHaveBeenCalled();
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("stores a cron without activating", async () => {
    db.scrapingScheduler.create.mockResolvedValue({ id: 3 });
    db.scrapingScheduler.findFirst.mockResolvedValue({ ...scheduler, id: 3 });
    db.scrapingScheduler.update.mockResolvedValue({ ...scheduler, id: 3, cron_expression: "0 8 * * *" });
    expect(await run("create_scheduler", { title: "C", cron_expression: "0 8 * * *" })).toMatchObject({ ok: true, output: { status: "DESACTIVATE" } });
    expect(db.scrapingScheduler.update).toHaveBeenCalledWith({ where: { id: 3 }, data: expect.objectContaining({ cron_expression: "0 8 * * *", status: undefined }) });
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it("validates create_scheduler before writing anything", async () => {
    expect(await run("create_scheduler", { title: "X", cron_expression: "n'importe quoi" })).toMatchObject({ ok: false, summary: expect.stringContaining("Expression cron invalide") });
    expect(await run("create_scheduler", { title: "X", activate: true })).toMatchObject({ ok: false, summary: expect.stringContaining("Un cron est nécessaire") });
    expect(await run("create_scheduler", { title: "X", urls: ["ftp://a.example/file"] })).toMatchObject({ ok: false, summary: expect.stringContaining("Seules les adresses http(s) publiques peuvent être scrapées : ftp://a.example/file") });
    expect(await run("create_scheduler", { title: "X", urls: ["nope"] })).toMatchObject({ ok: false, summary: expect.stringContaining("URL invalide") });
    expect(await run("create_scheduler", { title: "X", urls: [""] })).toMatchObject({ ok: false, summary: expect.stringContaining("« url »") });
    expect(await run("create_scheduler", { title: "" })).toMatchObject({ ok: false, summary: expect.stringContaining("« title »") });
    expect(await run("create_scheduler", { title: "X" }, user({ accessScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("modifyScraperStatus") });
    expect(db.scrapingScheduler.create).not.toHaveBeenCalled();
  });

  it("activates with the stored cron and rejects bad status values", async () => {
    const withCron = { ...scheduler, cron_expression: "0 * * * *" };
    db.scrapingScheduler.findUnique.mockResolvedValue(withCron);
    db.scrapingScheduler.findFirst.mockResolvedValue(withCron);
    db.scrapingScheduler.update.mockResolvedValue({ ...withCron, status: "ACTIVATE" });
    expect(await run("update_scheduler", { id: 1, status: "ACTIVATE" })).toMatchObject({ ok: true, summary: "Planificateur modifié : « Veille » (statut)", output: { status: "ACTIVATE", cron_expression: "0 * * * *" } });
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith("scheduler-1", { pattern: "0 * * * *", tz: "UTC" }, { name: "scheduler-1", data: { schedulerId: 1 } });

    expect(await run("update_scheduler", { id: 1, status: "RUNNING" })).toMatchObject({ ok: false, summary: expect.stringContaining("ACTIVATE ou DESACTIVATE") });
    // Clearing the cron while activating is refused, even though one is stored.
    expect(await run("update_scheduler", { id: 1, status: "ACTIVATE", cron_expression: " " })).toMatchObject({ ok: false, summary: expect.stringContaining("n’a pas de cron") });
  });

  it("restores the previous configuration when the queue refuses the change", async () => {
    const active = { ...scheduler, status: "ACTIVATE", cron_expression: "0 * * * *", next_run_at: new Date("2026-10-07T11:00:00Z") };
    db.scrapingScheduler.findUnique.mockResolvedValue(active);
    db.scrapingScheduler.findFirst.mockResolvedValue(active);
    db.scrapingScheduler.update.mockResolvedValueOnce({ ...active, cron_expression: "*/5 * * * *" });
        queue.upsertJobScheduler.mockRejectedValueOnce(new Error("Redis down")).mockResolvedValue(undefined);
    expect(await run("update_scheduler", { id: 1, cron_expression: "*/5 * * * *" })).toMatchObject({ ok: false, summary: expect.stringContaining("Redis down") });
    expect(db.scrapingScheduler.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: "ACTIVATE", cron_expression: "0 * * * *", next_run_at: active.next_run_at } });
    // The previous job is scheduled again.
    expect(queue.upsertJobScheduler).toHaveBeenLastCalledWith("scheduler-1", { pattern: "0 * * * *", tz: "UTC" }, { name: "scheduler-1", data: { schedulerId: 1 } });
  });

  it("clears the cron and edits title/description", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(scheduler);
    db.scrapingScheduler.findFirst.mockResolvedValue(scheduler);
    db.scrapingScheduler.update.mockResolvedValue({ ...scheduler, title: "Nouveau" });
    expect(await run("update_scheduler", { id: 1, title: "Nouveau", description: null, cron_expression: "" })).toMatchObject({ ok: true, summary: "Planificateur modifié : « Nouveau » (titre, description, cron)" });
    expect(db.scrapingScheduler.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { title: "Nouveau", description: "", status: undefined, cron_expression: null } });
    expect(await run("update_scheduler", { id: 1, title: " " })).toMatchObject({ ok: false, summary: expect.stringContaining("« title »") });
    db.scrapingScheduler.findUnique.mockResolvedValue(null);
    expect(await run("update_scheduler", { id: 1, title: "x" })).toMatchObject({ ok: false, summary: expect.stringContaining("Le planificateur 1 n’existe pas") });
  });

  it("adds a URL and warns when no active scraper covers it", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(scheduler);
    db.instanceScrape.create.mockResolvedValue({ id: 40 });
    db.scraper.findFirst.mockResolvedValue(null);
    const result = await run("add_scheduler_url", { id: 1, url: "https://nobody.example/p" });
    expect(result).toMatchObject({ ok: true, summary: "URL ajoutée à « Veille »", output: { instanceId: 40, scraper: null, warning: expect.stringContaining("Aucun scraper ACTIVE") } });
    expect(db.scraper.findFirst).toHaveBeenCalledWith({ where: { base_url: { has: "https://nobody.example" }, status: "ACTIVE" }, select: { name: true } });

    db.scraper.findFirst.mockResolvedValue({ name: "Nobody" });
    const covered = await run("add_scheduler_url", { id: 1, url: "https://nobody.example/q" });
    expect(covered.output).toEqual({ instanceId: 40, scraper: "Nobody" });

    expect(await run("add_scheduler_url", { id: 1, url: "javascript:alert(1)" })).toMatchObject({ ok: false, summary: expect.stringContaining("adresses http(s) publiques") });
  });

  it("removes a scheduler URL and its history, refusing a standalone instance", async () => {
    db.instanceScrape.findUnique.mockResolvedValue({ id: 9, url: "https://a.example/", scrapingSchedulerId: null });
    expect(await run("remove_scheduler_url", { instanceId: 9 })).toMatchObject({ ok: false, summary: expect.stringContaining("L’instance 9 n’appartient à aucun planificateur") });
    db.instanceScrape.findUnique.mockResolvedValue(null);
    expect(await run("remove_scheduler_url", { instanceId: 9 })).toMatchObject({ ok: false });
    expect(db.instanceScrape.delete).not.toHaveBeenCalled();

    db.instanceScrape.findUnique.mockResolvedValue({ id: 9, url: "https://a.example/", scrapingSchedulerId: 1 });
    expect(await run("remove_scheduler_url", { instanceId: 9 })).toMatchObject({ ok: true, summary: "URL retirée : https://a.example/" });
    expect(db.instanceScrapeHistory.deleteMany).not.toHaveBeenCalled();
    expect(db.instanceScrape.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it("does not delete a missing scheduler", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(null);
    expect(await run("delete_scheduler", { id: 5 })).toMatchObject({ ok: false, summary: expect.stringContaining("n’existe pas") });
    expect(db.scrapingScheduler.delete).not.toHaveBeenCalled();
  });
});

describe("instance tools", () => {
  it("lists instances with a status filter and a clamped limit", async () => {
    db.instanceScrape.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await run("list_instances", { status: "ERROR", limit: 1000 })).toMatchObject({ ok: true, summary: "2 instances listées" });
    expect(db.instanceScrape.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { status: "ERROR" }, take: 200, orderBy: { last_update: "desc" } }));

    db.instanceScrape.findMany.mockResolvedValue([{ id: 1 }]);
    expect(await run("list_instances", { limit: -5 })).toMatchObject({ summary: "1 instance listée" });
    expect(db.instanceScrape.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined, take: 1 }));

    await run("list_instances", { limit: "beaucoup" });
    expect(db.instanceScrape.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 50 }));

    expect(await run("list_instances", {}, user({ accessScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("accessInstancesScrapersPage") });
  });

  it("refuses an unknown status filter with a clear message instead of a Prisma error", async () => {
    expect(await run("list_instances", { status: "DONE" })).toMatchObject({ ok: false, summary: expect.stringContaining("IN_QUEUE, STARTING, WORKING, FINISHED, ERROR") });
    expect(await run("list_instances", { status: 3 })).toMatchObject({ ok: false });
    expect(db.instanceScrape.findMany).not.toHaveBeenCalled();
  });

  it("reads an instance", async () => {
    db.instanceScrape.findUnique.mockResolvedValue({ id: 3, url: "https://a.example/", response: { x: 1 } });
    expect(await run("read_instance", { id: 3 })).toMatchObject({ ok: true, summary: "Instance lue : https://a.example/", output: { response: { x: 1 } } });
    db.instanceScrape.findUnique.mockResolvedValue(null);
    expect(await run("read_instance", { id: 3 })).toMatchObject({ ok: false, summary: expect.stringContaining("L’instance 3 n’existe pas") });
  });

  it("needs useScraper and a valid URL to run a scrape", async () => {
    expect(await run("run_scrape", { url: "https://a.example/" }, user({ accessInstancesScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("useScraper") });
    expect(await run("run_scrape", { url: "file:///etc/passwd" })).toMatchObject({ ok: false, summary: expect.stringContaining("adresses http(s) publiques") });
    expect(await run("run_scrape", {})).toMatchObject({ ok: false, summary: expect.stringContaining("« url »") });
    db.scraper.findFirst.mockResolvedValue(null);
    expect(await run("run_scrape", { url: "https://a.example/p" })).toMatchObject({ ok: false, summary: expect.stringContaining("Aucun scraper ACTIVE ne gère https://a.example") });
    expect(db.instanceScrape.create).not.toHaveBeenCalled();

    db.scraper.findFirst.mockResolvedValue({ id: 5, name: "A" });
    db.instanceScrape.create.mockResolvedValue({ id: 50 });
    expect(await run("run_scrape", { url: "https://a.example/p" })).toEqual({ ok: true, summary: "Scrape lancé avec « A »", output: { instanceId: 50, scraper: "A", status: "IN_QUEUE" } });
    expect(db.instanceScrape.create).toHaveBeenCalledWith({ data: { url: "https://a.example/p", scraperId: 5, scrapingSchedulerId: undefined } });
  });

  it("returns an ERROR instance immediately", async () => {
    db.instanceScrape.findUnique.mockResolvedValue({ id: 6, status: "ERROR", response: null });
    expect(await run("wait_for_instance", { id: 6 })).toEqual({ ok: true, summary: "Instance 6 : ERROR", output: { id: 6, status: "ERROR", response: null } });
    expect(db.instanceScrape.findUnique).toHaveBeenCalledTimes(1);
  });

  it("gives up after the deadline with a note", async () => {
    vi.useFakeTimers();
    db.instanceScrape.findUnique.mockResolvedValue({ id: 7, status: "WORKING" });
    const pending = run("wait_for_instance", { id: 7, seconds: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ ok: true, summary: "Instance 7 : WORKING", output: { id: 7, status: "WORKING", note: expect.stringContaining("Toujours en cours") } });
    expect(db.instanceScrape.findUnique.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("caps the wait at 60 seconds", async () => {
    vi.useFakeTimers();
    db.instanceScrape.findUnique.mockResolvedValue({ id: 7, status: "IN_QUEUE" });
    let settled = false;
    const pending = run("wait_for_instance", { id: 7, seconds: 3600 }).then((r) => { settled = true; return r; });
    await vi.advanceTimersByTimeAsync(55_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ ok: true, output: { note: expect.any(String) } });
  });

  it("fails when the awaited instance disappears or the id is invalid", async () => {
    db.instanceScrape.findUnique.mockResolvedValue(null);
    expect(await run("wait_for_instance", { id: 8 })).toMatchObject({ ok: false, summary: expect.stringContaining("L’instance 8 n’existe pas") });
    expect(await run("wait_for_instance", { id: "x" })).toMatchObject({ ok: false, summary: expect.stringContaining("Identifiant d") });
  });

  it("deletes an instance with its history", async () => {
    db.instanceScrape.findUnique.mockResolvedValue(null);
    expect(await run("delete_instance", { id: 4 })).toMatchObject({ ok: false, summary: expect.stringContaining("n’existe pas") });
    expect(await run("delete_instance", { id: 4 }, user({ accessInstancesScrapersPage: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("useScraper") });
    expect(db.instanceScrape.delete).not.toHaveBeenCalled();

    db.instanceScrape.findUnique.mockResolvedValue({ id: 4, url: "https://a.example/" });
    expect(await run("delete_instance", { id: 4 }, user({ useScraper: true }))).toMatchObject({ ok: true, summary: "Instance supprimée : https://a.example/" });
    expect(db.instanceScrapeHistory.deleteMany).not.toHaveBeenCalled();
    expect(db.instanceScrape.delete).toHaveBeenCalledWith({ where: { id: 4 } });
  });
});
