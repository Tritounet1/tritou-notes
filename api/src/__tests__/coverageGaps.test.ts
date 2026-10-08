import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ removeDocumentImages: vi.fn() }));
vi.mock("../utils/documentImageStorage", async (importOriginal) => ({ ...await importOriginal<typeof import("../utils/documentImageStorage")>(), removeDocumentImages: mocks.removeDocumentImages }));
vi.mock("../config/queue", () => ({ scrapeQueue: {} }));
vi.mock("../config/mailClient", () => ({ sendEmail: vi.fn() }));
vi.mock("../utils/utils", () => ({ makeid: () => "id", encrypt: (value: string) => value, decrypt: (value: string) => value }));
import * as documents from "../controllers/documentController";
import * as folders from "../controllers/folderController";
import * as schedulers from "../controllers/scrapingSchedulerController";
import { deleteDocumentTree } from "../services/documentService";
import { deleteFolderKeepingContent, folderChain, resolveFolder } from "../utils/folderTree";

type Folder = { id: number; name: string; parentId: number | null };
const useFolders = (tree: Folder[]) =>
  db.folder.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => tree.find((f) => f.id === where.id) ?? null);

beforeEach(() => {
  resetDatabase();
  mocks.removeDocumentImages.mockReset().mockResolvedValue(undefined);
});

describe("folder tree helpers", () => {
  it("keeps the root as null", async () => {
    expect(await resolveFolder(null)).toBeNull();
    expect(db.folder.findUnique).not.toHaveBeenCalled();
  });

  it.each(["abc", 1.5, 0, -3])("rejects the invalid folder id %j without querying", async (raw) => {
    await expect(resolveFolder(raw)).rejects.toMatchObject({ status: 400, message: "Dossier invalide" });
    expect(db.folder.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a numeric string for an existing folder", async () => {
    useFolders([{ id: 4, name: "Perso", parentId: null }]);
    expect(await resolveFolder("4")).toBe(4);
  });

  it("stops the chain at a missing folder", async () => {
    // 3 → 2 → (1 missing)
    useFolders([{ id: 3, name: "Archive", parentId: 2 }, { id: 2, name: "Clients", parentId: 1 }]);
    expect(await folderChain(3)).toEqual([{ id: 2, name: "Clients" }, { id: 3, name: "Archive" }]);
  });

  it("stops on a corrupt cycle instead of looping forever", async () => {
    useFolders([{ id: 1, name: "A", parentId: 2 }, { id: 2, name: "B", parentId: 1 }]);
    expect(await folderChain(1)).toEqual([{ id: 2, name: "B" }, { id: 1, name: "A" }]);
    expect(db.folder.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns an empty chain for root pages", async () => {
    expect(await folderChain(null)).toEqual([]);
  });

  it("refuses to delete an unknown folder", async () => {
    db.folder.findUnique.mockResolvedValue(null);
    await expect(deleteFolderKeepingContent(99)).rejects.toMatchObject({ status: 404, message: "Dossier introuvable" });
    expect(db.folder.delete).not.toHaveBeenCalled();
    expect(db.document.updateMany).not.toHaveBeenCalled();
  });
});

describe("folder controller edge cases", () => {
  beforeEach(() => { useFolders([{ id: 1, name: "Projets", parentId: null }, { id: 2, name: "Clients", parentId: 1 }]); });

  it("creates a root folder with a name capped at 120 characters", async () => {
    const { status } = await call(folders.createFolder, { name: "n".repeat(150), parentId: null });
    expect(db.folder.create.mock.calls[0][0].data).toEqual({ name: "n".repeat(120) });
    expect(status).toHaveBeenCalledWith(201);
  });

  it("requires a string name", async () => {
    const { next } = await call(folders.createFolder, { name: 42 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "Nom du dossier requis" }));
    expect(db.folder.create).not.toHaveBeenCalled();
  });

  it("renames only", async () => {
    await call(folders.updateFolder, { name: " Clients 2026 " }, { params: { id: "2" } });
    expect(db.folder.update.mock.calls[0][0]).toMatchObject({ where: { id: 2 }, data: { name: "Clients 2026" } });
    expect(db.folder.update.mock.calls[0][0].data).not.toHaveProperty("parent");
  });

  it("moves only, back to the root", async () => {
    await call(folders.updateFolder, { parentId: null }, { params: { id: "2" } });
    expect(db.folder.update.mock.calls[0][0].data).toEqual({ parent: { disconnect: true } });
  });

  it("changes nothing with an empty body", async () => {
    await call(folders.updateFolder, {}, { params: { id: "2" }, body: undefined });
    expect(db.folder.update.mock.calls[0][0].data).toEqual({});
  });

  it("returns 404 when updating an unknown folder", async () => {
    const { next } = await call(folders.updateFolder, { name: "X" }, { params: { id: "99" } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: "Dossier introuvable" }));
    expect(db.folder.update).not.toHaveBeenCalled();
  });

  it("returns 404 when deleting an unknown folder", async () => {
    const { next, json } = await call(folders.deleteFolder, {}, { params: { id: "99" } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    expect(json).not.toHaveBeenCalled();
  });

  it("reports where the content of a deleted folder moved", async () => {
    const { json } = await call(folders.deleteFolder, {}, { params: { id: "2" } });
    expect(db.folder.updateMany).toHaveBeenCalledWith({ where: { parentId: 2 }, data: { parentId: 1 } });
    expect(db.document.updateMany).toHaveBeenCalledWith({ where: { folderId: 2 }, data: { folderId: 1 } });
    expect(json).toHaveBeenCalledWith({ success: true, movedTo: 1 });
  });
});

describe("document controller edge cases", () => {
  it("creates a root page inside a folder", async () => {
    useFolders([{ id: 4, name: "Perso", parentId: null }]);
    await call(documents.createDocument, { title: "Notes", type: "TEXT", folderId: 4 });
    expect(db.document.create.mock.calls[0][0].data).toEqual({ title: "Notes", type: "TEXT", folder: { connect: { id: 4 } }, lastEditor: { connect: { id: 7 } }, author: { connect: { id: 7 } } });
  });

  it("lists children and the folder path of a root page", async () => {
    useFolders([{ id: 4, name: "Perso", parentId: null }]);
    db.document.findUnique.mockResolvedValue({ id: 1, title: "Root", parentId: null, folderId: 4, public: true });
    db.document.findMany.mockResolvedValue([{ id: 5, title: "Public", type: "TEXT", public: true }, { id: 6, title: "Private", type: "EXCEL", public: false }]);
    const signedIn = await call(documents.getDocumentById, {}, { params: { id: "1" } });
    expect(signedIn.json.mock.calls[0][0]).toMatchObject({
      folders: [{ id: 4, name: "Perso" }],
      ancestors: [],
      children: [{ id: 5, title: "Public", type: "TEXT" }, { id: 6, title: "Private", type: "EXCEL" }],
    });
    const anonymous = await call(documents.getDocumentById, {}, { params: { id: "1" }, user: undefined });
    expect(anonymous.json.mock.calls[0][0]).toMatchObject({ folders: [], children: [{ id: 5, title: "Public", type: "TEXT" }] });
  });
});

describe("scheduler list", () => {
  it("adds recent runs and the timeline to each scheduler", async () => {
    const at = new Date("2026-01-01T10:00:00Z");
    db.scrapingScheduler.findMany.mockResolvedValue([
      { id: 1, title: "S", cron_expression: null, InstanceScrapes: [{ status: "FINISHED", last_update: at }], instanceScrapeHistories: [] },
    ]);
    const { json } = await call(schedulers.getScrapingScheduler);
    expect(json).toHaveBeenCalledWith([{ id: 1, title: "S", cron_expression: null, recentRuns: [{ status: "FINISHED", at }], timeline: [] }]);
  });
});

describe("document deletion", () => {
  it("logs image cleanup failures instead of failing the deletion", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    db.document.findMany.mockResolvedValue([]);
    db.document.delete.mockResolvedValue({ id: 1 });
    mocks.removeDocumentImages.mockRejectedValue(new Error("disk full"));
    await expect(deleteDocumentTree(1)).resolves.toEqual({ deleted: { id: 1 }, subtree: [1] });
    expect(error).toHaveBeenCalledWith("Image cleanup failed for document", 1, expect.objectContaining({ message: "disk full" }));
    error.mockRestore();
  });
});

describe("application routes", () => {
  it("answers the health check and serves the favicon without authentication", async () => {
    const { default: app } = await import("../app");
    const server = createServer(app).listen(0);
    await once(server, "listening");
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      expect((await fetch(`${base}/health`)).status).toBe(200);
      const favicon = await fetch(`${base}/favicon.ico`);
      expect(favicon.status).toBe(200);
      expect(favicon.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await favicon.arrayBuffer()).subarray(1, 4).toString()).toBe("PNG");
    } finally {
      server.close();
    }
  });
});
