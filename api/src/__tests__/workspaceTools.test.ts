import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const queue = vi.hoisted(() => ({ add: vi.fn(), getRepeatableJobs: vi.fn(), removeRepeatableByKey: vi.fn() }));
vi.mock("../config/queue", () => ({ scrapeQueue: queue }));
const images = vi.hoisted(() => ({ removeDocumentImages: vi.fn() }));
vi.mock("../utils/documentImageStorage", () => images);
import { runTool, type ToolContext } from "../ai/tools";

const admin = (): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set() });
const user = (permissions: Record<string, boolean>): ToolContext => ({ userId: 8, isAdmin: false, permissions: permissions as never, changed: new Set() });
const run = (name: string, args: object, ctx = admin()) => runTool(name, JSON.stringify(args), ctx);

beforeEach(() => {
  resetDatabase();
  images.removeDocumentImages.mockReset().mockResolvedValue(undefined);
});

describe("folder tools", () => {
  it("lists folders ordered by name", async () => {
    db.folder.findMany.mockResolvedValue([{ id: 1, name: "A", parentId: null }, { id: 2, name: "B", parentId: 1 }]);
    expect(await run("list_folders", {}, user({}))).toEqual({ ok: true, summary: "2 dossiers listés", output: [{ id: 1, name: "A", parentId: null }, { id: 2, name: "B", parentId: 1 }] });
    expect(db.folder.findMany).toHaveBeenCalledWith({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } });
    db.folder.findMany.mockResolvedValue([]);
    expect(await run("list_folders", {})).toMatchObject({ summary: "0 dossier listé" });
  });

  it("creates a folder inside a parent, trimming and truncating its name", async () => {
    db.folder.findUnique.mockResolvedValue({ id: 2 });
    db.folder.create.mockImplementation(async ({ data }) => ({ id: 3, ...data }));
    const ctx = user({ createDocument: true });
    const longName = `  ${"x".repeat(130)}  `;
    expect(await run("create_folder", { name: longName, parentId: 2 }, ctx)).toMatchObject({ ok: true, output: { id: 3 } });
    expect(db.folder.create).toHaveBeenCalledWith({ data: { name: "x".repeat(120), parent: { connect: { id: 2 } } } });
    expect(ctx.treeChanged).toBe(true);

    db.folder.create.mockClear();
    await run("create_folder", { name: "Racine", parentId: null });
    expect(db.folder.create).toHaveBeenCalledWith({ data: { name: "Racine" } });
  });

  it("refuses to create a folder without permission, name or valid parent", async () => {
    const ctx = user({ modifyDocument: true });
    expect(await run("create_folder", { name: "X" }, ctx)).toMatchObject({ ok: false, summary: expect.stringContaining("createDocument") });
    expect(ctx.treeChanged).toBeUndefined();
    expect(await run("create_folder", { name: "  " })).toMatchObject({ ok: false, summary: expect.stringContaining("« name »") });
    db.folder.findUnique.mockResolvedValue(null);
    expect(await run("create_folder", { name: "X", parentId: 99 })).toMatchObject({ ok: false, summary: expect.stringContaining("Dossier introuvable") });
    expect(await run("create_folder", { name: "X", parentId: "abc" })).toMatchObject({ ok: false, summary: expect.stringContaining("Dossier invalide") });
    expect(db.folder.create).not.toHaveBeenCalled();
  });

  it("renames and moves a folder", async () => {
    db.folder.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, name: `F${where.id}`, parentId: null }));
    db.folder.findMany.mockResolvedValue([]);
    db.folder.update.mockImplementation(async ({ data }) => ({ id: 1, name: data.name ?? "F1" }));
    const ctx = user({ modifyDocument: true });
    expect(await run("update_folder", { id: 1, name: " Renommé ", parentId: 5 }, ctx)).toEqual({ ok: true, output: { ok: true }, summary: "Dossier modifié : « Renommé »" });
    expect(db.folder.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: "Renommé", parent: { connect: { id: 5 } } } });
    expect(ctx.treeChanged).toBe(true);

    db.folder.update.mockClear();
    await run("update_folder", { id: 1, parentId: null });
    expect(db.folder.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { parent: { disconnect: true } } });

    db.folder.update.mockClear();
    await run("update_folder", { id: 1 });
    expect(db.folder.update).toHaveBeenCalledWith({ where: { id: 1 }, data: {} });
  });

  it("refuses folder cycles and missing folders", async () => {
    db.folder.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, name: "F", parentId: null }));
    expect(await run("update_folder", { id: 1, parentId: 1 })).toMatchObject({ ok: false, summary: expect.stringContaining("dans lui-même") });
    db.folder.findMany.mockResolvedValueOnce([{ id: 2 }]).mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce([]);
    expect(await run("update_folder", { id: 1, parentId: 3 })).toMatchObject({ ok: false, summary: expect.stringContaining("un de ses sous-dossiers") });
    expect(db.folder.update).not.toHaveBeenCalled();

    db.folder.findUnique.mockResolvedValue(null);
    expect(await run("update_folder", { id: 4, name: "x" })).toMatchObject({ ok: false, summary: expect.stringContaining("Le dossier 4 n’existe pas") });
    expect(await run("update_folder", { id: 0 })).toMatchObject({ ok: false, summary: expect.stringContaining("Identifiant de dossier invalide") });
    expect(await run("update_folder", { id: 1 }, user({ createDocument: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("modifyDocument") });
  });

  it("deletes a folder and moves its content up one level", async () => {
    db.folder.findUnique.mockResolvedValue({ id: 4, name: "Vieux", parentId: 2 });
    const ctx = user({ deleteDocument: true });
    expect(await run("delete_folder", { id: 4 }, ctx)).toEqual({ ok: true, output: { ok: true, contentMovedTo: 2 }, summary: "Dossier supprimé : « Vieux »" });
    expect(db.folder.updateMany).toHaveBeenCalledWith({ where: { parentId: 4 }, data: { parentId: 2 } });
    expect(db.document.updateMany).toHaveBeenCalledWith({ where: { folderId: 4 }, data: { folderId: 2 } });
    expect(db.folder.delete).toHaveBeenCalledWith({ where: { id: 4 } });
    expect(ctx.treeChanged).toBe(true);

    db.folder.delete.mockClear();
    expect(await run("delete_folder", { id: 4 }, user({ modifyDocument: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("deleteDocument") });
    db.folder.findUnique.mockResolvedValue(null);
    expect(await run("delete_folder", { id: 4 })).toMatchObject({ ok: false, summary: expect.stringContaining("n’existe pas") });
    expect(db.folder.delete).not.toHaveBeenCalled();
  });
});

describe("delete_page", () => {
  it("deletes a single page", async () => {
    db.document.findUnique.mockResolvedValue({ id: 10, title: "" });
    const ctx = user({ deleteDocument: true });
    expect(await run("delete_page", { id: 10 }, ctx)).toEqual({ ok: true, output: { ok: true, deletedPages: [10] }, summary: "Page supprimée : « Sans titre »" });
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(images.removeDocumentImages).toHaveBeenCalledWith(10);
    expect([...ctx.changed]).toEqual([10]);
  });

  it("deletes the whole subtree", async () => {
    db.document.findUnique.mockResolvedValue({ id: 10, title: "Racine" });
    db.document.findMany.mockResolvedValueOnce([{ id: 11 }, { id: 12 }]).mockResolvedValueOnce([{ id: 13 }]).mockResolvedValueOnce([]);
    const ctx = admin();
    expect(await run("delete_page", { id: 10 }, ctx)).toMatchObject({ ok: true, summary: "Page supprimée : « Racine » (+ 3 sous-pages)", output: { deletedPages: [10, 11, 12, 13] } });
    expect(db.document.delete).toHaveBeenCalledOnce();
    expect([...ctx.changed]).toEqual([10, 11, 12, 13]);
  });

  it("refuses without permission, with a bad id, or on a missing page", async () => {
    expect(await run("delete_page", { id: 10 }, user({ modifyDocument: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("deleteDocument") });
    expect(await run("delete_page", { id: "dix" })).toMatchObject({ ok: false, summary: expect.stringContaining("Identifiant de page invalide") });
    db.document.findUnique.mockResolvedValue(null);
    expect(await run("delete_page", { id: 10 })).toMatchObject({ ok: false, summary: expect.stringContaining("La page 10 n’existe pas") });
    expect(db.document.delete).not.toHaveBeenCalled();
  });
});

describe("user administration", () => {
  it("lists users for administrators only", async () => {
    expect(await run("list_users", {}, user({ useAiChatBot: true }))).toMatchObject({ ok: false, summary: "Échec de list_users : Réservé aux administrateurs." });
    expect(db.user.findMany).not.toHaveBeenCalled();
    db.user.findMany.mockResolvedValue([{ id: 1, username: "a" }]);
    expect(await run("list_users", {})).toMatchObject({ ok: true, summary: "1 utilisateur listé", output: [{ id: 1 }] });
    db.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await run("list_users", {})).toMatchObject({ summary: "2 utilisateurs listés" });
  });

  it("upserts boolean permissions and refuses non-boolean values or arrays", async () => {
    db.user.findUnique.mockResolvedValue({ username: "camille", role: "USER" });
    expect(await run("update_user_permissions", { userId: 8, permissions: { useScraper: true, deleteDocument: "true" } })).toMatchObject({
      ok: false, summary: expect.stringContaining("deleteDocument"),
    });
    expect(await run("update_user_permissions", { userId: 8, permissions: [true] })).toMatchObject({ ok: false, summary: expect.stringContaining("doit être un objet") });
    expect(db.userPermissions.upsert).not.toHaveBeenCalled();

    const result = await run("update_user_permissions", { userId: 8, permissions: { useScraper: true, deleteDocument: false } });
    expect(result).toEqual({ ok: true, output: { ok: true }, summary: "Permissions de « camille » modifiées" });
    expect(db.userPermissions.upsert).toHaveBeenCalledWith({
      where: { userId: 8 },
      update: { useScraper: true, deleteDocument: false },
      create: { userId: 8, useScraper: true, deleteDocument: false },
    });
  });

  it("adds a note when the target is an administrator", async () => {
    db.user.findUnique.mockResolvedValue({ username: "boss", role: "ADMIN" });
    expect(await run("update_user_permissions", { userId: 1, permissions: {} })).toMatchObject({ ok: true, output: { ok: true, note: expect.stringContaining("administrateurs") } });
  });

  it("validates the request", async () => {
    expect(await run("update_user_permissions", { userId: 8, permissions: {} }, user({ useAiChatBot: true }))).toMatchObject({ ok: false, summary: expect.stringContaining("Réservé aux administrateurs") });
    expect(await run("update_user_permissions", { userId: -1, permissions: {} })).toMatchObject({ ok: false, summary: expect.stringContaining("Identifiant de utilisateur invalide") });
    db.user.findUnique.mockResolvedValue(null);
    expect(await run("update_user_permissions", { userId: 9, permissions: {} })).toMatchObject({ ok: false, summary: expect.stringContaining("L’utilisateur 9 n’existe pas") });
    db.user.findUnique.mockResolvedValue({ username: "c", role: "USER" });
    expect(await run("update_user_permissions", { userId: 8 })).toMatchObject({ ok: false, summary: expect.stringContaining("`permissions` doit être un objet") });
    expect(await run("update_user_permissions", { userId: 8, permissions: "all" })).toMatchObject({ ok: false, summary: expect.stringContaining("`permissions` doit être un objet") });
    expect(await run("update_user_permissions", { userId: 8, permissions: { root: true, sudo: false, useScraper: true } })).toMatchObject({ ok: false, summary: expect.stringContaining("Permissions inconnues : root, sudo.") });
    expect(db.userPermissions.upsert).not.toHaveBeenCalled();
  });
});
