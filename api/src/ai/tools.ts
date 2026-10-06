import { prisma } from "../config/prismaClient";
import type { UserPermissions } from "../generated/prisma/client";
import { reviseDocument } from "../utils/documentRevision";
import { ancestorsOf, resolveParent } from "../utils/documentTree";
import { resolveFolder } from "../utils/folderTree";
import type { ToolDefinition } from "./openrouter";

type PermissionKey = keyof Omit<UserPermissions, "id" | "userId">;

export interface ToolContext {
  userId: number;
  isAdmin: boolean;
  permissions: UserPermissions | null;
  /** Ids of pages created or modified during this turn, so the UI can reload them. */
  changed: Set<number>;
}

export interface ToolResult {
  /** JSON sent back to the model. */
  output: unknown;
  /** Short French label shown in the chat. */
  summary: string;
  ok: boolean;
}

const MAX_READ_CHARS = 60_000;

class ToolError extends Error {}

const can = (ctx: ToolContext, permission: PermissionKey) => ctx.isAdmin || ctx.permissions?.[permission] === true;

const requirePermission = (ctx: ToolContext, permission: PermissionKey) => {
  if (!can(ctx, permission)) throw new ToolError(`Permission « ${permission} » manquante pour cet utilisateur.`);
};

const pageId = (value: unknown) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ToolError("Identifiant de page invalide.");
  return id;
};

const findPage = async (value: unknown) => {
  const page = await prisma.document.findUnique({ where: { id: pageId(value) } });
  if (!page) throw new ToolError(`La page ${value} n’existe pas.`);
  return page;
};

/** Markdown tools only touch TEXT pages; spreadsheets and to-dos have their own tools. */
const findTextPage = async (value: unknown) => {
  const page = await findPage(value);
  if (page.type !== "TEXT") {
    const hint = page.type === "TODO" ? "utilise update_todos" : "utilise set_cells";
    throw new ToolError(`La page « ${page.title} » est de type ${page.type} : ${hint}.`);
  }
  return page;
};

const findPageOfType = async (value: unknown, type: "TODO" | "EXCEL") => {
  const page = await findPage(value);
  if (page.type !== type) throw new ToolError(`La page « ${page.title} » est de type ${page.type}, pas ${type}.`);
  return page;
};

// ---- To-do and spreadsheet formats (mirrors app/src/components/TodoEditor.tsx and SpreadsheetEditor.tsx) ----

interface TodoItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  createdAt: string;
}

type Cells = Record<string, { value: string; formula?: string }>;

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

const todosOf = (text: string) => parseJson<{ todos?: TodoItem[] }>(text, {}).todos ?? [];

/** Same id shape as the editor's generateId(). */
const todoId = () => Math.random().toString(36).substring(2, 9);

/** A1 to Z50: the editor's grid (26 columns × 50 rows). */
const CELL_KEY = /^([A-Z])([1-9]\d?)$/;
const isCellKey = (key: string) => {
  const match = CELL_KEY.exec(key);
  return Boolean(match) && Number(match![2]) <= 50;
};

const label = (title: string) => `« ${title || "Sans titre"} »`;

const string = (value: unknown, name: string, { allowEmpty = false } = {}) => {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new ToolError(`Paramètre « ${name} » manquant.`);
  return value;
};

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<Omit<ToolResult, "ok">>;

const tools: Record<string, { definition: ToolDefinition["function"]; run: Handler }> = {
  list_pages: {
    definition: {
      name: "list_pages",
      description: "Liste les pages de l’espace (id, titre, type, parentId, folderId). Filtre optionnel sur le titre.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Texte à chercher dans les titres" } } },
    },
    run: async ({ query }) => {
      const pages = await prisma.document.findMany({
        where: typeof query === "string" && query.trim() ? { title: { contains: query.trim(), mode: "insensitive" } } : undefined,
        select: { id: true, title: true, type: true, parentId: true, folderId: true, last_update: true },
        orderBy: { last_update: "desc" },
        take: 200,
      });
      return { output: pages, summary: `${pages.length} page${pages.length > 1 ? "s" : ""} listée${pages.length > 1 ? "s" : ""}` };
    },
  },

  search_pages: {
    definition: {
      name: "search_pages",
      description: "Recherche plein texte dans les titres et le contenu des pages. Renvoie des extraits autour des correspondances.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
    run: async ({ query }) => {
      const needle = string(query, "query").trim();
      const pages = await prisma.document.findMany({
        where: {
          OR: [
            { title: { contains: needle, mode: "insensitive" } },
            { text: { contains: needle, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, type: true, text: true },
        take: 20,
      });
      const results = pages.map(({ text, ...page }) => {
        const at = text.toLowerCase().indexOf(needle.toLowerCase());
        return { ...page, excerpt: at < 0 ? null : text.slice(Math.max(0, at - 200), at + needle.length + 200) };
      });
      return { output: results, summary: `Recherche « ${needle} » : ${results.length} résultat${results.length > 1 ? "s" : ""}` };
    },
  },

  read_page: {
    definition: {
      name: "read_page",
      description: "Lit une page : titre, type, parents, sous-pages et contenu (`text` en Markdown pour TEXT, `todos` pour TODO, `cells` pour EXCEL).",
      parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
    },
    run: async ({ id }) => {
      const page = await findPage(id);
      const [ancestors, children] = await Promise.all([
        ancestorsOf(page.parentId),
        prisma.document.findMany({ where: { parentId: page.id }, select: { id: true, title: true, type: true } }),
      ]);
      if (page.type !== "TEXT") {
        // Structured pages are returned parsed, so the model never edits raw JSON.
        const content = page.type === "TODO" ? { todos: todosOf(page.text) } : { cells: parseJson<Cells>(page.text, {}) };
        return {
          output: { id: page.id, title: page.title, type: page.type, public: page.public, parentId: page.parentId, path: ancestors.map((a) => a.title), children, ...content },
          summary: `Page lue : ${label(page.title)}`,
        };
      }
      const truncated = page.text.length > MAX_READ_CHARS;
      return {
        output: {
          id: page.id,
          title: page.title,
          type: page.type,
          public: page.public,
          parentId: page.parentId,
          path: ancestors.map((a) => a.title),
          children,
          text: truncated ? page.text.slice(0, MAX_READ_CHARS) : page.text,
          ...(truncated && { note: `Contenu tronqué à ${MAX_READ_CHARS} caractères sur ${page.text.length}.` }),
        },
        summary: `Page lue : ${label(page.title)}`,
      };
    },
  },

  create_page: {
    definition: {
      name: "create_page",
      description:
        "Crée une page texte (Markdown), soit comme sous-page d’une autre (parentId), soit à la racine d’un dossier (folderId). " +
        "Un lien ::page[id]:: est ajouté à la fin du parent s’il s’agit d’une page texte.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          text: { type: "string", description: "Contenu Markdown initial" },
          parentId: { type: "integer", description: "Page parente (optionnel)" },
          folderId: { type: "integer", description: "Dossier, pour une page sans parent (optionnel, voir list_folders)" },
        },
        required: ["title"],
      },
    },
    run: async ({ title, text, parentId, folderId }, ctx) => {
      requirePermission(ctx, "createDocument");
      const name = string(title, "title");
      const parent = parentId === undefined || parentId === null ? null : await resolveParent(parentId);
      const folder = parent === null && folderId != null ? await resolveFolder(folderId) : null;
      const page = await prisma.document.create({
        data: {
          title: name,
          type: "TEXT",
          text: typeof text === "string" ? text : "",
          author: { connect: { id: ctx.userId } },
          ...(parent !== null && { parent: { connect: { id: parent } } }),
          ...(folder !== null && { folder: { connect: { id: folder } } }),
        },
      });
      ctx.changed.add(page.id);
      if (parent !== null && can(ctx, "modifyDocument")) {
        const parentPage = await prisma.document.findUnique({ where: { id: parent } });
        if (parentPage?.type === "TEXT") {
          const separator = parentPage.text && !parentPage.text.endsWith("\n") ? "\n" : "";
          await reviseDocument(parent, ctx.userId, { text: `${parentPage.text}${separator}::page[${page.id}]::\n` });
          ctx.changed.add(parent);
        }
      }
      return { output: { id: page.id, title: page.title, parentId: page.parentId }, summary: `Page créée : ${label(page.title)}` };
    },
  },

  edit_page: {
    definition: {
      name: "edit_page",
      description:
        "Modification ciblée d’une page texte : remplace `old_text` (qui doit apparaître exactement une fois, espaces et retours à la ligne compris) par `new_text`. " +
        "À préférer à rewrite_page. Lis la page avant pour copier le texte exact.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" }, old_text: { type: "string" }, new_text: { type: "string" } },
        required: ["id", "old_text", "new_text"],
      },
    },
    run: async ({ id, old_text, new_text }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const page = await findTextPage(id);
      const search = string(old_text, "old_text");
      const replacement = string(new_text, "new_text", { allowEmpty: true });
      const count = page.text.split(search).length - 1;
      if (count !== 1) {
        throw new ToolError(count === 0 ? "`old_text` est introuvable : relis la page et copie le passage exact." : `\`old_text\` apparaît ${count} fois : ajoute du contexte pour le rendre unique.`);
      }
      await reviseDocument(page.id, ctx.userId, { text: page.text.replace(search, () => replacement) });
      ctx.changed.add(page.id);
      return { output: { ok: true }, summary: `Page modifiée : ${label(page.title)}` };
    },
  },

  append_to_page: {
    definition: {
      name: "append_to_page",
      description: "Ajoute du Markdown à la fin d’une page texte.",
      parameters: { type: "object", properties: { id: { type: "integer" }, text: { type: "string" } }, required: ["id", "text"] },
    },
    run: async ({ id, text }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const page = await findTextPage(id);
      const addition = string(text, "text");
      const separator = page.text && !page.text.endsWith("\n") ? "\n\n" : "";
      await reviseDocument(page.id, ctx.userId, { text: `${page.text}${separator}${addition}` });
      ctx.changed.add(page.id);
      return { output: { ok: true }, summary: `Contenu ajouté à ${label(page.title)}` };
    },
  },

  rewrite_page: {
    definition: {
      name: "rewrite_page",
      description:
        "Remplace entièrement le titre et/ou le contenu d’une page. Le contenu n’est modifiable que pour les pages texte. " +
        "Conserve les blocs ::page[…]::, ::scheduler[…]::, ::link[…]:: et ::image[…]:: existants.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" }, title: { type: "string" }, text: { type: "string" } },
        required: ["id"],
      },
    },
    run: async ({ id, title, text }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      if (title === undefined && text === undefined) throw new ToolError("Indique au moins `title` ou `text`.");
      const page = text === undefined ? await findPage(id) : await findTextPage(id);
      await reviseDocument(page.id, ctx.userId, {
        ...(title !== undefined && { title: string(title, "title") }),
        ...(text !== undefined && { text: string(text, "text", { allowEmpty: true }) }),
      });
      ctx.changed.add(page.id);
      const name = typeof title === "string" ? title : page.title;
      return { output: { ok: true }, summary: `Page réécrite : ${label(name)}` };
    },
  },

  move_page: {
    definition: {
      name: "move_page",
      description:
        "Déplace une page : sous une autre page (parentId), dans un dossier (folderId), ou à la racine sans dossier (parentId = null). " +
        "Une page placée dans un dossier n’a plus de parent.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" }, parentId: { type: ["integer", "null"] }, folderId: { type: "integer" } },
        required: ["id"],
      },
    },
    run: async ({ id, parentId, folderId }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const page = await findPage(id);
      if (folderId != null && parentId != null) throw new ToolError("Choisis soit parentId, soit folderId.");
      await reviseDocument(page.id, ctx.userId, folderId != null ? { folderId, parentId: null } : { parentId: parentId ?? null, folderId: null });
      ctx.changed.add(page.id);
      return { output: { ok: true }, summary: `Page déplacée : ${label(page.title)}` };
    },
  },

  update_todos: {
    definition: {
      name: "update_todos",
      description:
        "Modifie une liste de tâches (page TODO) : ajoute, met à jour ou supprime des tâches. " +
        "Les ids viennent de read_page. Les tâches ajoutées vont à la fin, dans l’ordre donné.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Id de la page TODO" },
          add: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, description: { type: "string" }, completed: { type: "boolean" } },
              required: ["title"],
            },
          },
          update: {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, completed: { type: "boolean" } },
              required: ["id"],
            },
          },
          remove: { type: "array", items: { type: "string" }, description: "Ids des tâches à supprimer" },
        },
        required: ["id"],
      },
    },
    run: async ({ id, add, update, remove }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const page = await findPageOfType(id, "TODO");
      let todos = todosOf(page.text);
      const known = new Set(todos.map((t) => t.id));
      const missing = [...(Array.isArray(update) ? update.map((u) => String(u?.id)) : []), ...(Array.isArray(remove) ? remove.map(String) : [])].filter((x) => !known.has(x));
      if (missing.length) throw new ToolError(`Tâches introuvables : ${missing.join(", ")}. Relis la page avec read_page.`);

      const removed = new Set(Array.isArray(remove) ? remove.map(String) : []);
      todos = todos.filter((t) => !removed.has(t.id));
      for (const change of Array.isArray(update) ? update : []) {
        todos = todos.map((t) =>
          t.id !== String(change.id)
            ? t
            : {
                ...t,
                ...(typeof change.title === "string" && { title: change.title }),
                ...(typeof change.description === "string" && { description: change.description }),
                ...(typeof change.completed === "boolean" && { completed: change.completed }),
              },
        );
      }
      const added = (Array.isArray(add) ? add : []).map((item) => ({
        id: todoId(),
        title: string(item?.title, "add.title"),
        description: typeof item?.description === "string" ? item.description : "",
        completed: item?.completed === true,
        createdAt: new Date().toISOString(),
      }));
      todos.push(...added);
      await reviseDocument(page.id, ctx.userId, { text: JSON.stringify({ todos }) });
      ctx.changed.add(page.id);
      const parts = [added.length && `${added.length} ajoutée(s)`, Array.isArray(update) && update.length && `${update.length} modifiée(s)`, removed.size && `${removed.size} supprimée(s)`].filter(Boolean);
      return { output: { ok: true, todos }, summary: `To-do ${label(page.title)} : ${parts.join(", ") || "aucun changement"}` };
    },
  },

  set_cells: {
    definition: {
      name: "set_cells",
      description:
        "Écrit dans un tableur (page EXCEL) : `cells` associe une référence (A1 à Z50) à une valeur. " +
        "Une valeur commençant par « = » est une formule : SUM(A1:A5), AVERAGE(B2:B9), ou de l’arithmétique sur des cellules (=A1*B1+2). " +
        "Une chaîne vide efface la cellule. Les autres cellules ne changent pas.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Id de la page EXCEL" },
          cells: { type: "object", additionalProperties: { type: "string" }, description: "Ex. { \"A1\": \"Mois\", \"B1\": \"Total\", \"B5\": \"=SUM(B2:B4)\" }" },
        },
        required: ["id", "cells"],
      },
    },
    run: async ({ id, cells }, ctx) => {
      requirePermission(ctx, "modifyDocument");
      const page = await findPageOfType(id, "EXCEL");
      if (!cells || typeof cells !== "object" || Array.isArray(cells)) throw new ToolError("`cells` doit être un objet { \"A1\": \"valeur\" }.");
      const entries = Object.entries(cells as Record<string, unknown>).map(([key, value]) => [key.toUpperCase(), value == null ? "" : String(value)] as const);
      const invalid = entries.filter(([key]) => !isCellKey(key)).map(([key]) => key);
      if (invalid.length) throw new ToolError(`Références hors grille (A1 à Z50) : ${invalid.join(", ")}.`);

      const grid = parseJson<Cells>(page.text, {});
      for (const [key, value] of entries) {
        // Same shape as SpreadsheetEditor.commitEdit.
        if (!value) delete grid[key];
        else grid[key] = value.startsWith("=") ? { value: "", formula: value } : { value };
      }
      await reviseDocument(page.id, ctx.userId, { text: JSON.stringify(grid) });
      ctx.changed.add(page.id);
      return { output: { ok: true }, summary: `Tableur ${label(page.title)} : ${entries.length} cellule${entries.length > 1 ? "s" : ""} modifiée${entries.length > 1 ? "s" : ""}` };
    },
  },

  list_folders: {
    definition: {
      name: "list_folders",
      description: "Liste les dossiers (id, nom, parentId). Les dossiers rangent les pages racines ; les sous-pages restent sous leur page parente.",
      parameters: { type: "object", properties: {} },
    },
    run: async () => {
      const folders = await prisma.folder.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
      return { output: folders, summary: `${folders.length} dossier${folders.length > 1 ? "s" : ""} listé${folders.length > 1 ? "s" : ""}` };
    },
  },

  list_schedulers: {
    definition: {
      name: "list_schedulers",
      description: "Liste les planificateurs de scraping (id, titre, statut, cron). Pour afficher leurs données live dans une page, insère ::scheduler[id]:: sur sa propre ligne.",
      parameters: { type: "object", properties: {} },
    },
    run: async () => {
      const schedulers = await prisma.scrapingScheduler.findMany({
        select: { id: true, title: true, description: true, status: true, cron_expression: true, last_run_at: true },
      });
      return { output: schedulers, summary: `${schedulers.length} planificateur${schedulers.length > 1 ? "s" : ""} listé${schedulers.length > 1 ? "s" : ""}` };
    },
  },
};

export const toolDefinitions: ToolDefinition[] = Object.values(tools).map(({ definition }) => ({ type: "function", function: definition }));

/** Runs one tool call. Failures become tool results so the model can recover. */
export const runTool = async (name: string, rawArguments: string, ctx: ToolContext): Promise<ToolResult> => {
  const tool = tools[name];
  if (!tool) return { ok: false, output: { error: `Outil inconnu : ${name}` }, summary: `Outil inconnu : ${name}` };
  let args: Record<string, unknown>;
  try {
    args = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    return { ok: false, output: { error: "Arguments JSON invalides" }, summary: `Échec de ${name} : arguments invalides` };
  }
  try {
    return { ok: true, ...(await tool.run(args, ctx)) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: { error: message }, summary: `Échec de ${name} : ${message}` };
  }
};
