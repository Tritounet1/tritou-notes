import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
vi.mock("../utils/utils", () => ({ decrypt: (value: string) => `plain:${value}`, encrypt: (value: string) => value }));
import { runTool, toolDefinitions, type ToolContext } from "../ai/tools";

type Page = { id: number; title: string; type: string; text: string; parentId: number | null; public: boolean };

const ctx = (overrides: Partial<ToolContext> = {}): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set(), ...overrides });
const run = (name: string, args: unknown, context = ctx()) => runTool(name, JSON.stringify(args), context);
const page = (overrides: Partial<Page> = {}): Page => ({ id: 3, title: "Notes", type: "TEXT", text: "Intro", parentId: null, public: false, ...overrides });
/** Serves pages by id to every findUnique (findPage, ancestorsOf, resolveParent…). */
const pages = (...list: Page[]) => {
  db.document.findUnique.mockImplementation(async ({ where: { id } }: { where: { id: number } }) => list.find((p) => p.id === id) ?? null);
  db.document.findFirst.mockImplementation(async ({ where: { id } }: { where: { id: number } }) => list.find((p) => p.id === id) ?? null);
};
const updated = () => db.document.update.mock.calls[0][0];
const todo = (id: string, extra: object = {}) => ({ id, title: `T-${id}`, description: "", completed: false, createdAt: "2026-01-01", ...extra });

beforeEach(() => resetDatabase());

describe("registry", () => {
  it("exposes every tool as a function definition", () => {
    const names = toolDefinitions.map((d) => d.function.name);
    expect(toolDefinitions.every((d) => d.type === "function")).toBe(true);
    expect(names).toEqual(expect.arrayContaining(["list_pages", "search_pages", "read_page", "create_page", "edit_page", "append_to_page", "rewrite_page", "move_page", "update_todos", "set_cells"]));
    expect(new Set(names).size).toBe(names.length);
  });

  it("reports unknown tools, invalid JSON and non-Error throws as failed results", async () => {
    expect(await runTool("nope", "{}", ctx())).toEqual({ ok: false, output: { error: "Outil inconnu : nope" }, summary: "Outil inconnu : nope" });
    expect(await runTool("read_page", "{oops", ctx())).toEqual({ ok: false, output: { error: "Arguments JSON invalides" }, summary: "Échec de read_page : arguments invalides" });
    db.document.findMany.mockRejectedValue("db down");
    expect(await runTool("list_pages", "", ctx())).toEqual({ ok: false, output: { error: "db down" }, summary: "Échec de list_pages : db down" });
  });

  it("treats an empty argument string as no arguments", async () => {
    expect(await runTool("read_page", "", ctx())).toMatchObject({ ok: false, summary: "Échec de read_page : Identifiant de page invalide." });
  });
});

describe("list_pages and search_pages", () => {
  it("lists every page without a query and filters by trimmed title otherwise", async () => {
    db.document.findMany.mockResolvedValue([{ id: 1 }]);
    expect(await run("list_pages", {})).toMatchObject({ ok: true, output: [{ id: 1 }], summary: "1 page listée" });
    expect(db.document.findMany.mock.calls[0][0]).toMatchObject({ where: undefined, take: 200, orderBy: { last_update: "desc" } });

    db.document.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await run("list_pages", { query: "  courses " })).toMatchObject({ summary: "2 pages listées" });
    expect(db.document.findMany.mock.calls[1][0].where).toEqual({ title: { contains: "courses", mode: "insensitive" } });

    await run("list_pages", { query: "   " });
    expect(db.document.findMany.mock.calls[2][0].where).toBeUndefined();
  });

  it("returns excerpts around the first match, or null when only the title matches", async () => {
    const long = `${"a".repeat(300)}Needle${"b".repeat(300)}`;
    db.document.findMany.mockResolvedValue([
      { id: 1, title: "Doc", type: "TEXT", text: long },
      { id: 2, title: "needle in title", type: "TEXT", text: "rien" },
    ]);
    const result = await run("search_pages", { query: " needle " });
    expect(result).toMatchObject({ ok: true, summary: "Recherche « needle » : 2 résultats" });
    const [first, second] = result.output as { id: number; excerpt: string | null; text?: string }[];
    expect(first.excerpt).toBe(`${"a".repeat(200)}Needle${"b".repeat(200)}`);
    expect(first).not.toHaveProperty("text");
    expect(second).toEqual({ id: 2, title: "needle in title", type: "TEXT", excerpt: null });
    expect(db.document.findMany.mock.calls[0][0].where.OR).toEqual([
      { title: { contains: "needle", mode: "insensitive" } },
      { text: { contains: "needle", mode: "insensitive" } },
    ]);
  });

  it("starts the excerpt at 0 near the beginning and requires a query", async () => {
    db.document.findMany.mockResolvedValue([{ id: 1, title: "x", type: "TEXT", text: "abc needle" }]);
    expect((await run("search_pages", { query: "needle" })).output).toEqual([{ id: 1, title: "x", type: "TEXT", excerpt: "abc needle" }]);
    expect((await run("search_pages", { query: "needle" })).summary).toBe("Recherche « needle » : 1 résultat");
    expect(await run("search_pages", {})).toMatchObject({ ok: false, summary: "Échec de search_pages : Paramètre « query » manquant." });
  });
});

describe("read_page", () => {
  it("returns a text page with its path and children", async () => {
    pages(page({ id: 3, parentId: 2, text: "Corps" }), page({ id: 2, title: "Parent", parentId: 1 }), page({ id: 1, title: "Racine" }));
    db.document.findMany.mockResolvedValue([{ id: 4, title: "Enfant", type: "TODO" }]);
    const result = await run("read_page", { id: 3 });
    expect(result).toEqual({
      ok: true,
      summary: "Page lue : « Notes »",
      output: { id: 3, title: "Notes", type: "TEXT", public: false, parentId: 2, path: ["Racine", "Parent"], children: [{ id: 4, title: "Enfant", type: "TODO" }], text: "Corps" },
    });
    expect(db.document.findMany).toHaveBeenCalledWith({ where: { parentId: 3 }, select: { id: true, title: true, type: true } });
  });

  it("truncates very long text pages with a note", async () => {
    pages(page({ text: "x".repeat(60_005), title: "" }));
    const result = await run("read_page", { id: 3 });
    const output = result.output as { text: string; note: string };
    expect(output.text).toHaveLength(60_000);
    expect(output.note).toBe("Contenu tronqué à 60000 caractères sur 60005.");
    expect(result.summary).toBe("Page lue : « Sans titre »");
  });

  it("does not add a note at exactly the limit", async () => {
    pages(page({ text: "x".repeat(60_000) }));
    expect((await run("read_page", { id: 3 })).output).not.toHaveProperty("note");
  });

  it("parses to-dos and spreadsheets, tolerating empty or corrupt JSON", async () => {
    pages(page({ id: 3 }), page({ id: 5, type: "TODO", text: "" }), page({ id: 6, type: "EXCEL", text: '{"A1":{"value":"1"}}', parentId: 3 }), page({ id: 7, type: "EXCEL", text: "{corrupt" }), page({ id: 8, type: "TODO", text: "{}" }));
    expect((await run("read_page", { id: 5 })).output).toMatchObject({ type: "TODO", todos: [], path: [], children: [] });
    expect((await run("read_page", { id: 6 })).output).toMatchObject({ type: "EXCEL", path: ["Notes"], parentId: 3, cells: { A1: { value: "1" } } });
    expect((await run("read_page", { id: 7 })).output).toMatchObject({ cells: {} });
    expect((await run("read_page", { id: 8 })).output).toMatchObject({ todos: [] });
    expect((await run("read_page", { id: 6 })).output).not.toHaveProperty("text");
  });

  it("fails on a missing page or invalid id", async () => {
    pages();
    expect(await run("read_page", { id: 99 })).toMatchObject({ ok: false, summary: "Échec de read_page : La page 99 n’existe pas." });
    expect(await run("read_page", { id: -1 })).toMatchObject({ ok: false, summary: "Échec de read_page : Identifiant de page invalide." });
  });
});

describe("create_page", () => {
  beforeEach(() => {
    db.document.create.mockImplementation(async ({ data }: { data: { title: string } }) => ({ id: 9, title: data.title, parentId: null }));
  });

  it("creates a root text page with initial text", async () => {
    const context = ctx();
    const result = await run("create_page", { title: "Nouvelle", text: "# Hello" }, context);
    expect(result).toEqual({ ok: true, output: { id: 9, title: "Nouvelle", parentId: null }, summary: "Page créée : « Nouvelle »" });
    expect(db.document.create).toHaveBeenCalledWith({ data: { title: "Nouvelle", type: "TEXT", text: "# Hello", author: { connect: { id: 7 } }, lastEditor: { connect: { id: 7 } } } });
    expect([...context.changed]).toEqual([9]);
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("creates empty EXCEL and TODO pages (type case-insensitive) and ignores non-string text", async () => {
    await run("create_page", { title: "Budget", type: "EXCEL" });
    await run("create_page", { title: "Courses", type: "todo" });
    await run("create_page", { title: "Note", text: 42 });
    expect(db.document.create.mock.calls.map(([{ data }]) => [data.type, data.text])).toEqual([["EXCEL", ""], ["TODO", ""], ["TEXT", ""]]);
  });

  it("refuses unknown types and text for structured pages instead of dropping them", async () => {
    expect(await run("create_page", { title: "Autre", type: "PDF" })).toMatchObject({ ok: false, summary: expect.stringContaining("TEXT, EXCEL ou TODO") });
    expect(await run("create_page", { title: "Budget", type: "EXCEL", text: "a;b" })).toMatchObject({ ok: false, summary: expect.stringContaining("set_cells") });
    expect(await run("create_page", { title: "Courses", type: "TODO", text: "- lait" })).toMatchObject({ ok: false, summary: expect.stringContaining("update_todos") });
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("places a root page in a folder", async () => {
    db.folder.findUnique.mockResolvedValue({ id: 4 });
    await run("create_page", { title: "Rangée", folderId: 4 });
    expect(db.document.create.mock.calls[0][0].data.folder).toEqual({ connect: { id: 4 } });
    db.folder.findUnique.mockResolvedValue(null);
    expect(await run("create_page", { title: "x", folderId: 5 })).toMatchObject({ ok: false, summary: "Échec de create_page : Dossier introuvable" });
  });

  it("refuses a page both under a parent and in a folder", async () => {
    expect(await run("create_page", { title: "Sous", parentId: 3, folderId: 4 })).toMatchObject({ ok: false, summary: expect.stringContaining("pas les deux") });
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("creates a sub-page and links it from a text parent", async () => {
    pages(page({ text: "Intro\n" }));
    const context = ctx();
    await run("create_page", { title: "Sous", parentId: 3 }, context);
    const { data } = db.document.create.mock.calls[0][0];
    expect(data.parent).toEqual({ connect: { id: 3 } });
    expect(data).not.toHaveProperty("folder");
    expect(db.folder.findUnique).not.toHaveBeenCalled();
    // Already ends with a newline: no extra separator.
    expect(updated().data.text).toBe("Intro\n::page[9]::\n");
    expect([...context.changed].sort()).toEqual([3, 9]);
  });

  it("links from an empty text parent without a separator", async () => {
    pages(page({ text: "" }));
    await run("create_page", { title: "Sous", parentId: 3 });
    expect(updated().data.text).toBe("::page[9]::\n");
  });

  it("does not link from a non-text parent", async () => {
    pages(page({ type: "TODO", text: "{}" }));
    const context = ctx();
    expect(await run("create_page", { title: "Sous", parentId: 3 }, context)).toMatchObject({ ok: true });
    expect(db.document.update).not.toHaveBeenCalled();
    expect([...context.changed]).toEqual([9]);
  });

  it("does not link when the user may create but not modify pages", async () => {
    pages(page());
    const context = ctx({ isAdmin: false, permissions: { createDocument: true, modifyDocument: false } as ToolContext["permissions"] });
    expect(await run("create_page", { title: "Sous", parentId: 3 }, context)).toMatchObject({ ok: true });
    expect(db.document.update).not.toHaveBeenCalled();
    expect([...context.changed]).toEqual([9]);
  });

  it("treats a null parentId as root and rejects missing parents and titles", async () => {
    await run("create_page", { title: "Racine", parentId: null });
    expect(db.document.create.mock.calls[0][0].data).not.toHaveProperty("parent");
    pages();
    expect(await run("create_page", { title: "x", parentId: 404 })).toMatchObject({ ok: false, summary: "Échec de create_page : Page parente introuvable" });
    expect(await run("create_page", { title: "  " })).toMatchObject({ ok: false, summary: "Échec de create_page : Paramètre « title » manquant." });
    expect(db.document.create).toHaveBeenCalledOnce();
  });
});

describe("edit_page and append_to_page", () => {
  it("refuses zero or several occurrences", async () => {
    pages(page({ text: "a b a" }));
    expect(await run("edit_page", { id: 3, old_text: "z", new_text: "y" })).toMatchObject({ ok: false, output: { error: "`old_text` est introuvable : relis la page et copie le passage exact." } });
    expect(await run("edit_page", { id: 3, old_text: "a", new_text: "y" })).toMatchObject({ ok: false, output: { error: "`old_text` apparaît 2 fois : ajoute du contexte pour le rendre unique." } });
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("allows deleting a passage with an empty replacement", async () => {
    pages(page({ text: "garder supprimer" }));
    expect(await run("edit_page", { id: 3, old_text: " supprimer", new_text: "" })).toMatchObject({ ok: true });
    expect(updated().data.text).toBe("garder");
    expect(await run("edit_page", { id: 3, old_text: "x" })).toMatchObject({ ok: false, summary: "Échec de edit_page : Paramètre « new_text » manquant." });
  });

  it("refuses to write over a change made since the tool read the page", async () => {
    const readAt = new Date("2026-10-07T10:00:00Z");
    pages({ ...page({ text: "avant" }), last_update: readAt } as Page);
    db.document.update.mockRejectedValueOnce(Object.assign(new Error("No record"), { code: "P2025" }));
    expect(await run("edit_page", { id: 3, old_text: "avant", new_text: "après" })).toMatchObject({ ok: false, summary: expect.stringContaining("modifiée entre-temps") });
    expect(updated().where).toEqual({ id: 3, last_update: readAt });
  });

  it("points to the right tool for structured pages", async () => {
    pages(page({ id: 5, type: "TODO", title: "Courses" }), page({ id: 6, type: "EXCEL", title: "Budget" }));
    expect((await run("edit_page", { id: 5, old_text: "a", new_text: "b" })).output).toEqual({ error: "La page « Courses » est de type TODO : utilise update_todos." });
    expect((await run("edit_page", { id: 6, old_text: "a", new_text: "b" })).output).toEqual({ error: "La page « Budget » est de type EXCEL : utilise set_cells." });
  });

  it("separates appended text with a blank line only when needed", async () => {
    for (const [before, after] of [["Intro", "Intro\n\nSuite"], ["Intro\n", "Intro\nSuite"], ["", "Suite"]]) {
      resetDatabase();
      pages(page({ text: before }));
      const context = ctx();
      expect(await run("append_to_page", { id: 3, text: "Suite" }, context)).toMatchObject({ ok: true, summary: "Contenu ajouté à « Notes »" });
      expect(updated().data.text).toBe(after);
      expect([...context.changed]).toEqual([3]);
    }
    expect(await run("append_to_page", { id: 3, text: "" })).toMatchObject({ ok: false });
  });
});

describe("rewrite_page", () => {
  it("requires at least one change", async () => {
    pages(page());
    expect(await run("rewrite_page", { id: 3 })).toMatchObject({ ok: false, output: { error: "Indique au moins `title`, `text` ou `public`." } });
  });

  it("refuses a non-boolean visibility without saving a revision", async () => {
    pages(page());
    expect(await run("rewrite_page", { id: 3, public: "true" })).toMatchObject({ ok: false, output: { error: "`public` doit être true ou false." } });
    expect(db.documentHistory.create).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("renames, rewrites or changes visibility independently", async () => {
    pages(page());
    expect(await run("rewrite_page", { id: 3, title: "Nouveau" })).toMatchObject({ ok: true, summary: "Page réécrite : « Nouveau »" });
    expect(updated().data).toMatchObject({ title: "Nouveau", text: undefined, public: undefined });

    resetDatabase();
    pages(page());
    expect(await run("rewrite_page", { id: 3, text: "" })).toMatchObject({ ok: true, summary: "Page réécrite : « Notes »" });
    expect(updated().data).toMatchObject({ title: undefined, text: "", public: undefined });

    resetDatabase();
    pages(page());
    expect(await run("rewrite_page", { id: 3, public: true })).toMatchObject({ ok: true });
    expect(updated().data).toMatchObject({ title: undefined, text: undefined, public: true });
  });

  it("renames structured pages but refuses to replace their content", async () => {
    pages(page({ id: 5, type: "TODO", title: "Courses" }));
    expect(await run("rewrite_page", { id: 5, title: "Achats" })).toMatchObject({ ok: true });
    expect(await run("rewrite_page", { id: 5, text: "x" })).toMatchObject({ ok: false, output: { error: "La page « Courses » est de type TODO : utilise update_todos." } });
    expect(db.document.update).toHaveBeenCalledOnce();
  });
});

describe("move_page", () => {
  it("moves into a folder, under a page, or to the root", async () => {
    pages(page({ id: 3 }), page({ id: 2, title: "Parent" }));
    db.folder.findUnique.mockResolvedValue({ id: 4 });
    const context = ctx();
    expect(await run("move_page", { id: 3, folderId: 4 }, context)).toEqual({ ok: true, output: { ok: true }, summary: "Page déplacée : « Notes »" });
    expect(updated().data).toMatchObject({ parent: { disconnect: true }, folder: { connect: { id: 4 } } });
    expect([...context.changed]).toEqual([3]);

    db.document.update.mockClear();
    await run("move_page", { id: 3, parentId: 2 });
    expect(updated().data).toMatchObject({ parent: { connect: { id: 2 } }, folder: { disconnect: true } });

    db.document.update.mockClear();
    await run("move_page", { id: 3 });
    expect(updated().data).toMatchObject({ parent: { disconnect: true }, folder: { disconnect: true } });
  });

  it("refuses both a parent and a folder", async () => {
    pages(page());
    expect(await run("move_page", { id: 3, parentId: 2, folderId: 4 })).toMatchObject({ ok: false, output: { error: "Choisis soit parentId, soit folderId." } });
    expect(db.document.update).not.toHaveBeenCalled();
  });
});

describe("update_todos", () => {
  const todoPage = (todos: object[]) => page({ id: 5, type: "TODO", title: "Courses", text: JSON.stringify({ todos }) });

  it("updates only the given fields", async () => {
    pages(todoPage([todo("a1"), todo("b2", { description: "garder" })]));
    const result = await run("update_todos", { id: 5, update: [{ id: "a1", title: "Pain complet", description: "bio", completed: true }, { id: "b2", completed: "oui", title: 3 }] });
    expect(result).toMatchObject({ ok: true, summary: "To-do « Courses » : 2 modifiée(s)" });
    expect(JSON.parse(updated().data.text).todos).toEqual([
      todo("a1", { title: "Pain complet", description: "bio", completed: true }),
      todo("b2", { description: "garder" }),
    ]);
  });

  it("removes tasks and adds new ones with defaults", async () => {
    pages(todoPage([todo("a1"), todo("b2")]));
    const result = await run("update_todos", { id: 5, remove: ["a1"], add: [{ title: "Œufs", description: "x6", completed: true }, { title: "Sel" }] });
    expect(result.summary).toBe("To-do « Courses » : 2 ajoutée(s), 1 supprimée(s)");
    const { todos } = JSON.parse(updated().data.text);
    expect(todos).toMatchObject([{ id: "b2" }, { title: "Œufs", description: "x6", completed: true }, { title: "Sel", description: "", completed: false }]);
    expect(new Date(todos[1].createdAt).toString()).not.toBe("Invalid Date");
  });

  it("reports no change and starts from an empty list", async () => {
    pages(page({ id: 5, type: "TODO", title: "Vide", text: "" }));
    expect(await run("update_todos", { id: 5, update: [] })).toMatchObject({ ok: true, summary: "To-do « Vide » : aucun changement" });
    expect(JSON.parse(updated().data.text)).toEqual({ todos: [] });
  });

  it("lists every unknown id and rejects untitled additions", async () => {
    pages(todoPage([todo("a1")]));
    expect(await run("update_todos", { id: 5, update: [{ id: "x" }, { title: "sans id" }], remove: ["y", "a1"] })).toMatchObject({
      ok: false,
      output: { error: "Tâches introuvables : x, undefined, y. Relis la page avec read_page." },
    });
    expect(await run("update_todos", { id: 5, add: [{ description: "?" }] })).toMatchObject({ ok: false, summary: "Échec de update_todos : Paramètre « add.title » manquant." });
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("only works on TODO pages", async () => {
    pages(page());
    expect(await run("update_todos", { id: 3, add: [{ title: "x" }] })).toMatchObject({ ok: false, output: { error: "La page « Notes » est de type TEXT, pas TODO." } });
  });
});

describe("set_cells", () => {
  const sheet = (text = "") => page({ id: 6, type: "EXCEL", title: "Budget", text });

  it("rejects non-object cells", async () => {
    pages(sheet());
    for (const cells of [null, "A1", ["x"]]) {
      expect(await run("set_cells", { id: 6, cells })).toMatchObject({ ok: false, output: { error: "`cells` doit être un objet { \"A1\": \"valeur\" }." } });
    }
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("stringifies values, clears on null and counts cells", async () => {
    pages(sheet(JSON.stringify({ A1: { value: "old" }, Z50: { value: "z" } })));
    const context = ctx();
    expect(await run("set_cells", { id: 6, cells: { A1: null, B2: 42, z50: "fin" } }, context)).toMatchObject({ ok: true, summary: "Tableur « Budget » : 3 cellules modifiées" });
    expect(JSON.parse(updated().data.text)).toEqual({ B2: { value: "42" }, Z50: { value: "fin" } });
    expect([...context.changed]).toEqual([6]);
  });

  it("uses the singular for one cell and rejects rows out of range", async () => {
    pages(sheet());
    expect((await run("set_cells", { id: 6, cells: { A1: "x" } })).summary).toBe("Tableur « Budget » : 1 cellule modifiée");
    expect(await run("set_cells", { id: 6, cells: { A0: "x", A51: "y", A10: "ok" } })).toMatchObject({ ok: false, output: { error: "Références hors grille (A1 à Z50) : A0, A51." } });
  });

  it("only works on EXCEL pages", async () => {
    pages(page());
    expect(await run("set_cells", { id: 3, cells: {} })).toMatchObject({ ok: false, output: { error: "La page « Notes » est de type TEXT, pas EXCEL." } });
  });
});
