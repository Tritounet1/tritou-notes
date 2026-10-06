vi.mock("../utils/documentImageStorage", () => ({ removeDocumentImages: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
import { runTool } from "../ai/tools";
import * as folders from "../controllers/folderController";
import { reviseDocument } from "../utils/documentRevision";
import { folderChain } from "../utils/folderTree";

// Folders: 1 Projets → 2 Clients → 3 Archive ; 4 Perso
const tree = [
  { id: 1, name: "Projets", parentId: null },
  { id: 2, name: "Clients", parentId: 1 },
  { id: 3, name: "Archive", parentId: 2 },
  { id: 4, name: "Perso", parentId: null },
];

beforeEach(() => {
  resetDatabase();
  db.folder.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => tree.find((f) => f.id === where.id) ?? null);
  db.folder.findMany.mockImplementation(async ({ where }: { where?: { parentId: { in: number[] } } } = {}) =>
    where ? tree.filter((f) => f.parentId !== null && where.parentId.in.includes(f.parentId)) : tree);
});

describe("folder controller", () => {
  it("creates a folder, inside a parent when given", async () => {
    await call(folders.createFolder, { name: "  Factures  ", parentId: 1 });
    expect(db.folder.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Factures", parent: { connect: { id: 1 } } } }));
    const missing = await call(folders.createFolder, { name: "X", parentId: 99 });
    expect(missing.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    const empty = await call(folders.createFolder, { name: "  " });
    expect(empty.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Nom du dossier requis" }));
  });

  it("renames and moves a folder but never into its own subtree", async () => {
    await call(folders.updateFolder, { name: "Clients 2026", parentId: 4 }, { params: { id: "2" } });
    expect(db.folder.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 }, data: { name: "Clients 2026", parent: { connect: { id: 4 } } } }));
    for (const parentId of [2, 3]) {
      db.folder.update.mockClear();
      const ctx = await call(folders.updateFolder, { parentId }, { params: { id: "2" } });
      expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
      expect(db.folder.update).not.toHaveBeenCalled();
    }
  });

  it("deletes a folder by moving its pages and subfolders up one level", async () => {
    await call(folders.deleteFolder, {}, { params: { id: "2" } });
    expect(db.folder.updateMany).toHaveBeenCalledWith({ where: { parentId: 2 }, data: { parentId: 1 } });
    expect(db.document.updateMany).toHaveBeenCalledWith({ where: { folderId: 2 }, data: { folderId: 1 } });
    expect(db.folder.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    expect(db.document.delete).not.toHaveBeenCalled();
  });

  it("builds a folder path root first", async () => {
    expect(await folderChain(3)).toEqual([{ id: 1, name: "Projets" }, { id: 2, name: "Clients" }, { id: 3, name: "Archive" }]);
    expect(await folderChain(null)).toEqual([]);
  });
});

describe("pages in folders", () => {
  const page = { id: 10, title: "Note", text: "", public: false, parentId: 5, folderId: null };
  beforeEach(() => {
    db.document.findFirst.mockResolvedValue(page);
    db.document.findUnique.mockResolvedValue({ id: 5 });
  });
  const data = () => db.document.update.mock.calls[0][0].data;

  it("moving a page into a folder detaches it from its parent page", async () => {
    await reviseDocument(10, 7, { folderId: 3 });
    expect(data()).toMatchObject({ folder: { connect: { id: 3 } }, parent: { disconnect: true } });
  });

  it("moving a page under a page takes it out of its folder", async () => {
    db.document.findMany.mockResolvedValue([]);
    await reviseDocument(10, 7, { parentId: 5 });
    expect(data()).toMatchObject({ parent: { connect: { id: 5 } }, folder: { disconnect: true } });
  });

  it("refuses a page both under a page and in a folder", async () => {
    db.document.findMany.mockResolvedValue([]);
    await expect(reviseDocument(10, 7, { parentId: 5, folderId: 3 })).rejects.toMatchObject({ status: 400 });
  });

  it("lets the assistant list folders and file a page", async () => {
    const ctx = { userId: 7, isAdmin: true, permissions: null, changed: new Set<number>() };
    expect(await runTool("list_folders", "{}", ctx)).toMatchObject({ ok: true, summary: "4 dossiers listés" });
    db.document.findUnique.mockResolvedValue(page);
    expect(await runTool("move_page", JSON.stringify({ id: 10, folderId: 4 }), ctx)).toMatchObject({ ok: true });
    expect(data()).toMatchObject({ folder: { connect: { id: 4 } }, parent: { disconnect: true } });
  });
});

// A rejected dependency must reach Express's error handler.
for (const [name, handler] of Object.entries(folders)) {
  it(`${name} forwards dependency failures`, async () => {
    const failure = new Error("Dependency unavailable");
    for (const model of Object.values(db)) for (const mock of Object.values(model)) mock.mockRejectedValue(failure);
    const ctx = await call(handler, { name: "Dossier" });
    expect(ctx.next).toHaveBeenCalledWith(failure);
  });
}
