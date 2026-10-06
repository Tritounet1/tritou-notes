import { randomUUID } from "node:crypto";
import { prisma } from "../config/prismaClient";
import type { Prisma } from "../generated/prisma/client";
import { createInstance } from "../services/instanceService";
import { assertValidCron, deleteScheduler, updateScheduler } from "../services/schedulerService";
import { count, label, positiveInt, requirePermission, string, ToolError, type Tool } from "./toolKit";

// Scrapers, schedulers and instances: the assistant can do everything the Scraping pages do,
// through the same services as the REST API (so scheduler jobs stay in sync).

const TEMPLATE_TYPES = ["title", "text", "image", "link", "badge", "date"] as const;
const MAX_WAIT_SECONDS = 60;

const SCRAPER_FORMAT =
  "Le code d’un scraper est du JavaScript synchrone exécuté dans un sandbox qui ne contient que `$` (Cheerio chargé avec le HTML de la page) " +
  "et `result`, à assigner : un objet (une carte) ou un tableau d’objets (une carte par élément), ex. " +
  "`result = $(\".item\").map((i, el) => ({ title: $(el).find(\"h2\").text().trim(), price: $(el).find(\".price\").text() })).get();`. " +
  "Pas de console, fetch, await ni timers. `display_template` liste des blocs { type: title|text|image|link|badge|date, field: clé de result, label? }.";

const findScraper = async (value: unknown) => {
  const scraper = await prisma.scraper.findUnique({ where: { id: positiveInt(value, "scraper") } });
  if (!scraper) throw new ToolError(`Le scraper ${value} n’existe pas.`);
  return scraper;
};

const findScheduler = async (value: unknown) => {
  const scheduler = await prisma.scrapingScheduler.findUnique({ where: { id: positiveInt(value, "planificateur") } });
  if (!scheduler) throw new ToolError(`Le planificateur ${value} n’existe pas.`);
  return scheduler;
};

/** The worker matches scrapers on the page origin, so base URLs are stored as origins. */
const origins = (value: unknown) => {
  if (!Array.isArray(value)) throw new ToolError("`base_url` doit être une liste d’URL.");
  return [...new Set(value.map((raw) => {
    try {
      return new URL(String(raw)).origin;
    } catch {
      throw new ToolError(`URL invalide : ${raw}`);
    }
  }))];
};

const absoluteUrl = (value: unknown) => {
  const url = string(value, "url").trim();
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new ToolError(`URL invalide (http ou https attendu) : ${url}`);
  }
};

const template = (value: unknown) => {
  if (!Array.isArray(value)) throw new ToolError("`display_template` doit être une liste de blocs.");
  return value.map((block) => {
    const type = String(block?.type);
    if (!TEMPLATE_TYPES.includes(type as (typeof TEMPLATE_TYPES)[number])) throw new ToolError(`Type de bloc inconnu : ${type} (${TEMPLATE_TYPES.join(", ")}).`);
    return {
      id: typeof block.id === "string" && block.id ? block.id : randomUUID(),
      type,
      field: string(block.field, "field"),
      ...(typeof block.label === "string" && block.label && { label: block.label }),
    };
  }) as unknown as Prisma.InputJsonValue;
};

/** Scraper fields accepted by create / update, validated. */
const scraperData = (args: Record<string, unknown>) => ({
  ...(args.name !== undefined && { name: string(args.name, "name") }),
  ...(args.description !== undefined && { description: String(args.description ?? "") }),
  ...(args.code !== undefined && { code: string(args.code, "code", { allowEmpty: true }) }),
  ...(args.browser !== undefined && { browser: Boolean(args.browser) }),
  ...(args.base_url !== undefined && { base_url: origins(args.base_url) }),
  ...(args.display_template !== undefined && { display_template: template(args.display_template) }),
  ...(args.status !== undefined && { status: args.status === "ACTIVE" ? ("ACTIVE" as const) : ("DISABLE" as const) }),
});

const FIELD_LABELS: Record<string, string> = {
  name: "nom", description: "description", code: "code", browser: "navigateur", base_url: "sites", display_template: "template", status: "statut",
  title: "titre", cron_expression: "cron",
};
/** "(statut, cron)": which fields a tool call changed, shown in the chat for transparency. */
const changedFields = (data: object) => {
  const names = Object.keys(data).map((key) => FIELD_LABELS[key]).filter(Boolean);
  return names.length ? ` (${names.join(", ")})` : "";
};

const scraperFields = {
  name: { type: "string" },
  description: { type: "string" },
  base_url: { type: "array", items: { type: "string" }, description: "Sites gérés, ex. [\"https://www.amazon.fr\"] (seule l’origine compte)" },
  code: { type: "string", description: "Code du scraper (voir le format dans la description de l’outil)" },
  browser: { type: "boolean", description: "Navigateur Puppeteer (true) ou HTTP simple (false)" },
  display_template: {
    type: "array",
    items: {
      type: "object",
      properties: { type: { type: "string", enum: [...TEMPLATE_TYPES] }, field: { type: "string" }, label: { type: "string" } },
      required: ["type", "field"],
    },
  },
  status: { type: "string", enum: ["ACTIVE", "DISABLE"], description: "Seuls les scrapers ACTIVE sont utilisés par le worker" },
};

export const scrapingTools: Record<string, Tool> = {
  // ---- Scrapers ----
  list_scrapers: {
    definition: {
      name: "list_scrapers",
      description: "Liste les scrapers (id, nom, description, statut, sites gérés).",
      parameters: { type: "object", properties: {} },
    },
    run: async (_args, ctx) => {
      requirePermission(ctx, "accessScrapersPage");
      const scrapers = await prisma.scraper.findMany({
        select: { id: true, name: true, description: true, status: true, base_url: true, browser: true, last_update: true },
        orderBy: { name: "asc" },
      });
      return { output: scrapers, summary: `${count(scrapers.length, "scraper")} listé${scrapers.length > 1 ? "s" : ""}` };
    },
  },

  read_scraper: {
    definition: {
      name: "read_scraper",
      description: "Lit un scraper complet : code, sites gérés, template d’affichage, statut.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "accessScrapersPage");
      const scraper = await findScraper(id);
      return { output: scraper, summary: `Scraper lu : ${label(scraper.name)}` };
    },
  },

  create_scraper: {
    definition: {
      name: "create_scraper",
      description: `Crée un scraper (désactivé par défaut). ${SCRAPER_FORMAT}`,
      parameters: { type: "object", properties: scraperFields, required: ["name"] },
    },
    run: async (args, ctx) => {
      requirePermission(ctx, "modifyScraper");
      const scraper = await prisma.scraper.create({ data: { name: string(args.name, "name"), ...scraperData(args) } });
      return { output: { id: scraper.id, status: scraper.status }, summary: `Scraper créé : ${label(scraper.name)}` };
    },
  },

  update_scraper: {
    definition: {
      name: "update_scraper",
      description: `Modifie un scraper. Ne fournis QUE les champs à changer (les autres sont conservés ; base_url et display_template sont remplacés en entier). ${SCRAPER_FORMAT}`,
      parameters: { type: "object", properties: { id: { type: "integer" }, ...scraperFields }, required: ["id"] },
    },
    run: async (args, ctx) => {
      requirePermission(ctx, "modifyScraper");
      const scraper = await findScraper(args.id);
      const data = scraperData(args);
      const updated = await prisma.scraper.update({ where: { id: scraper.id }, data: { ...data, last_update: new Date() } });
      return { output: { ok: true, status: updated.status, base_url: updated.base_url }, summary: `Scraper modifié : ${label(updated.name)}${changedFields(data)}` };
    },
  },

  delete_scraper: {
    definition: {
      name: "delete_scraper",
      description: "Supprime définitivement un scraper. Uniquement sur demande explicite de l’utilisateur.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "deleteScraper");
      const scraper = await findScraper(id);
      await prisma.scraper.delete({ where: { id: scraper.id } });
      return { output: { ok: true }, summary: `Scraper supprimé : ${label(scraper.name)}` };
    },
  },

  // ---- Schedulers ----
  list_schedulers: {
    definition: {
      name: "list_schedulers",
      description:
        "Liste les planificateurs (id, titre, description, statut, cron, prochaine exécution). " +
        "Pour afficher leurs données live dans une page, insère ::scheduler[id]:: sur sa propre ligne.",
      parameters: { type: "object", properties: {} },
    },
    run: async (_args, ctx) => {
      requirePermission(ctx, "accessScrapersPage");
      const schedulers = await prisma.scrapingScheduler.findMany({
        select: { id: true, title: true, description: true, status: true, cron_expression: true, last_run_at: true, next_run_at: true, _count: { select: { InstanceScrapes: true } } },
        orderBy: { id: "asc" },
      });
      return {
        output: schedulers.map(({ _count, ...s }) => ({ ...s, urls: _count.InstanceScrapes })),
        summary: `${count(schedulers.length, "planificateur")} listé${schedulers.length > 1 ? "s" : ""}`,
      };
    },
  },

  read_scheduler: {
    definition: {
      name: "read_scheduler",
      description: "Lit un planificateur : réglages et URL suivies (instances) avec leur statut et dernier résultat.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "accessScrapersPage");
      const scheduler = await prisma.scrapingScheduler.findUnique({
        where: { id: positiveInt(id, "planificateur") },
        include: { InstanceScrapes: { select: { id: true, url: true, status: true, last_update: true, response: true }, orderBy: { created_at: "asc" } } },
      });
      if (!scheduler) throw new ToolError(`Le planificateur ${id} n’existe pas.`);
      const { InstanceScrapes, ...settings } = scheduler;
      return { output: { ...settings, urls: InstanceScrapes }, summary: `Planificateur lu : ${label(scheduler.title)}` };
    },
  },

  create_scheduler: {
    definition: {
      name: "create_scheduler",
      description:
        "Crée un planificateur, avec éventuellement ses URL, son cron (5 champs, ex. « 0 0 * * * » = tous les jours à minuit) " +
        "et son activation. Chaque URL doit être couverte par un scraper ACTIVE (vérifie avec list_scrapers).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          urls: { type: "array", items: { type: "string" } },
          cron_expression: { type: "string" },
          activate: { type: "boolean", description: "Active la planification (nécessite un cron)" },
        },
        required: ["title"],
      },
    },
    run: async ({ title, description, urls, cron_expression, activate }, ctx) => {
      requirePermission(ctx, "modifyScraperStatus");
      const name = string(title, "title");
      const cron = typeof cron_expression === "string" && cron_expression.trim() ? cron_expression.trim() : null;
      if (cron) assertValidCron(cron);
      if (activate && !cron) throw new ToolError("Un cron est nécessaire pour activer le planificateur.");
      const links = Array.isArray(urls) ? urls.map(absoluteUrl) : [];
      const scheduler = await prisma.scrapingScheduler.create({ data: { title: name, description: typeof description === "string" ? description : null } });
      for (const url of links) await createInstance({ url, scrapingSchedulerId: scheduler.id });
      if (cron || activate) {
        await updateScheduler(scheduler.id, ctx.userId, { cron_expression: cron, ...(activate === true && { status: "ACTIVATE" as const }) });
      }
      return {
        output: { id: scheduler.id, urls: links.length, cron_expression: cron, status: activate ? "ACTIVATE" : "DESACTIVATE" },
        summary: `Planificateur créé : ${label(name)}${activate ? " (activé)" : ""}`,
      };
    },
  },

  update_scheduler: {
    definition: {
      name: "update_scheduler",
      description:
        "Modifie un planificateur : titre, description, cron (5 champs), statut ACTIVATE (planifié) ou DESACTIVATE. Ne fournis QUE les champs à changer. " +
        "Changer le cron d’un planificateur actif le replanifie. Pour ses URL, utilise add_scheduler_url / remove_scheduler_url.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          description: { type: "string" },
          cron_expression: { type: "string" },
          status: { type: "string", enum: ["ACTIVATE", "DESACTIVATE"] },
        },
        required: ["id"],
      },
    },
    run: async ({ id, title, description, cron_expression, status }, ctx) => {
      requirePermission(ctx, "modifyScraperStatus");
      const scheduler = await findScheduler(id);
      if (status !== undefined && status !== "ACTIVATE" && status !== "DESACTIVATE") throw new ToolError("`status` doit valoir ACTIVATE ou DESACTIVATE.");
      const cron = cron_expression === undefined ? undefined : typeof cron_expression === "string" && cron_expression.trim() ? cron_expression.trim() : null;
      if (status === "ACTIVATE" && !(cron ?? (cron === undefined ? scheduler.cron_expression : null))) {
        throw new ToolError("Ce planificateur n’a pas de cron : fournis cron_expression pour l’activer.");
      }
      const changes = {
        ...(title !== undefined && { title: string(title, "title") }),
        ...(description !== undefined && { description: String(description ?? "") }),
        ...(cron !== undefined && { cron_expression: cron }),
        ...(status !== undefined && { status: status as "ACTIVATE" | "DESACTIVATE" }),
      };
      const updated = await updateScheduler(scheduler.id, ctx.userId, changes);
      return { output: { ok: true, status: updated.status, cron_expression: updated.cron_expression }, summary: `Planificateur modifié : ${label(updated.title)}${changedFields(changes)}` };
    },
  },

  add_scheduler_url: {
    definition: {
      name: "add_scheduler_url",
      description: "Ajoute une URL à suivre à un planificateur. Elle sera scrapée à chaque exécution, par le scraper ACTIVE qui gère son site.",
      parameters: { type: "object", properties: { id: { type: "integer", description: "Id du planificateur" }, url: { type: "string" } }, required: ["id", "url"] },
    },
    run: async ({ id, url }, ctx) => {
      requirePermission(ctx, "modifyScraperStatus");
      const scheduler = await findScheduler(id);
      const link = absoluteUrl(url);
      const instance = await createInstance({ url: link, scrapingSchedulerId: scheduler.id });
      const covered = await prisma.scraper.findFirst({ where: { base_url: { has: new URL(link).origin }, status: "ACTIVE" }, select: { name: true } });
      return {
        output: { instanceId: instance.id, scraper: covered?.name ?? null, ...(!covered && { warning: "Aucun scraper ACTIVE ne gère ce site : l’URL échouera tant qu’il n’y en a pas." }) },
        summary: `URL ajoutée à ${label(scheduler.title)}`,
      };
    },
  },

  remove_scheduler_url: {
    definition: {
      name: "remove_scheduler_url",
      description: "Retire une URL d’un planificateur (instanceId vient de read_scheduler).",
      parameters: { type: "object", properties: { instanceId: { type: "integer" } }, required: ["instanceId"] },
    },
    run: async ({ instanceId }, ctx) => {
      requirePermission(ctx, "modifyScraperStatus");
      const instance = await prisma.instanceScrape.findUnique({ where: { id: positiveInt(instanceId, "instance") } });
      if (!instance?.scrapingSchedulerId) throw new ToolError(`L’instance ${instanceId} n’appartient à aucun planificateur.`);
      await prisma.instanceScrapeHistory.deleteMany({ where: { instanceScrapeId: instance.id } });
      await prisma.instanceScrape.delete({ where: { id: instance.id } });
      return { output: { ok: true }, summary: `URL retirée : ${instance.url}` };
    },
  },

  delete_scheduler: {
    definition: {
      name: "delete_scheduler",
      description: "Supprime définitivement un planificateur et sa planification. Uniquement sur demande explicite de l’utilisateur.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "modifyScraperStatus");
      const scheduler = await findScheduler(id);
      await deleteScheduler(scheduler.id);
      return { output: { ok: true }, summary: `Planificateur supprimé : ${label(scheduler.title)}` };
    },
  },

  // ---- Instances ----
  list_instances: {
    definition: {
      name: "list_instances",
      description: "Liste les dernières instances de scrape (URL, statut, scraper, planificateur), les plus récentes d’abord.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["IN_QUEUE", "STARTING", "WORKING", "FINISHED", "ERROR"] },
          limit: { type: "integer", description: "50 par défaut, 200 max" },
        },
      },
    },
    run: async ({ status, limit }, ctx) => {
      requirePermission(ctx, "accessInstancesScrapersPage");
      const instances = await prisma.instanceScrape.findMany({
        where: typeof status === "string" ? { status: status as Prisma.EnumInstanceScrapeStatusFilter["equals"] } : undefined,
        select: { id: true, url: true, status: true, last_update: true, scrapingSchedulerId: true, scraper: { select: { id: true, name: true } } },
        orderBy: { last_update: "desc" },
        take: Math.min(Math.max(Number(limit) || 50, 1), 200),
      });
      return { output: instances, summary: `${count(instances.length, "instance")} listée${instances.length > 1 ? "s" : ""}` };
    },
  },

  read_instance: {
    definition: {
      name: "read_instance",
      description: "Lit une instance de scrape avec son résultat (response).",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "accessInstancesScrapersPage");
      const instance = await prisma.instanceScrape.findUnique({ where: { id: positiveInt(id, "instance") }, include: { scraper: { select: { id: true, name: true } } } });
      if (!instance) throw new ToolError(`L’instance ${id} n’existe pas.`);
      return { output: instance, summary: `Instance lue : ${instance.url}` };
    },
  },

  run_scrape: {
    definition: {
      name: "run_scrape",
      description:
        "Lance un scrape immédiat d’une URL (le scraper ACTIVE qui gère son site est choisi automatiquement). " +
        "Renvoie l’id de l’instance : utilise wait_for_instance pour obtenir le résultat.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
    run: async ({ url }, ctx) => {
      requirePermission(ctx, "useScraper");
      const link = absoluteUrl(url);
      // Same lookup as the worker, done up front to fail fast.
      const scraper = await prisma.scraper.findFirst({ where: { base_url: { has: new URL(link).origin }, status: "ACTIVE" }, select: { id: true, name: true } });
      if (!scraper) throw new ToolError(`Aucun scraper ACTIVE ne gère ${new URL(link).origin} : crée-le ou active-le d’abord.`);
      const instance = await createInstance({ url: link, scraperId: scraper.id });
      return { output: { instanceId: instance.id, scraper: scraper.name, status: "IN_QUEUE" }, summary: `Scrape lancé avec ${label(scraper.name)}` };
    },
  },

  wait_for_instance: {
    definition: {
      name: "wait_for_instance",
      description: `Attend la fin d’une instance de scrape (FINISHED ou ERROR), ${MAX_WAIT_SECONDS} s maximum, puis renvoie son résultat.`,
      parameters: { type: "object", properties: { id: { type: "integer" }, seconds: { type: "integer", description: `${MAX_WAIT_SECONDS} max` } }, required: ["id"] },
    },
    run: async ({ id, seconds }, ctx) => {
      requirePermission(ctx, "accessInstancesScrapersPage");
      const instanceId = positiveInt(id, "instance");
      const deadline = Date.now() + Math.min(Math.max(Number(seconds) || 30, 1), MAX_WAIT_SECONDS) * 1000;
      for (;;) {
        const instance = await prisma.instanceScrape.findUnique({ where: { id: instanceId }, select: { id: true, url: true, status: true, response: true } });
        if (!instance) throw new ToolError(`L’instance ${id} n’existe pas.`);
        if (instance.status === "FINISHED" || instance.status === "ERROR" || Date.now() >= deadline) {
          const done = instance.status === "FINISHED" || instance.status === "ERROR";
          return { output: done ? instance : { ...instance, note: "Toujours en cours : rappelle wait_for_instance." }, summary: `Instance ${instance.id} : ${instance.status}` };
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    },
  },

  delete_instance: {
    definition: {
      name: "delete_instance",
      description: "Supprime une instance de scrape et son historique. Uniquement sur demande explicite de l’utilisateur.",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }, ctx) => {
      requirePermission(ctx, "useScraper");
      const instance = await prisma.instanceScrape.findUnique({ where: { id: positiveInt(id, "instance") } });
      if (!instance) throw new ToolError(`L’instance ${id} n’existe pas.`);
      await prisma.instanceScrapeHistory.deleteMany({ where: { instanceScrapeId: instance.id } });
      await prisma.instanceScrape.delete({ where: { id: instance.id } });
      return { output: { ok: true }, summary: `Instance supprimée : ${instance.url}` };
    },
  },
};
