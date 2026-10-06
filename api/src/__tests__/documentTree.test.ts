vi.mock("../utils/documentImageStorage", () => ({ removeDocumentImages: vi.fn().mockResolvedValue(undefined) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
import * as documents from "../controllers/documentController";
import { removeDocumentImages } from "../utils/documentImageStorage";
import { ancestorsOf, descendantIds, resolveParent } from "../utils/documentTree";

// Tiny in-memory tree: 1 → 2 → 3, and 4 is a separate root.
const pages = [
  { id: 1, title: "Root", public: true, parentId: null },
  { id: 2, title: "Child", public: false, parentId: 1 },
  { id: 3, title: "Grandchild", public: true, parentId: 2 },
  { id: 4, title: "Other", public: true, parentId: null },
];

beforeEach(() => {
  resetDatabase();
  db.document.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => pages.find(p => p.id === where.id) ?? null);
  db.document.findMany.mockImplementation(async ({ where }: { where: { parentId: number | { in: number[] } } }) => {
    const parents = typeof where.parentId === "number" ? [where.parentId] : where.parentId.in;
    return pages.filter(p => p.parentId !== null && parents.includes(p.parentId)).map(p => ({ ...p, type: "TEXT" }));
  });
});

describe("document tree helpers", () => {
  it("walks descendants and ancestors", async () => {
    expect(await descendantIds(1)).toEqual([2, 3]);
    expect(await descendantIds(3)).toEqual([]);
    expect((await ancestorsOf(2)).map(p => p.id)).toEqual([1, 2]);
    expect(await ancestorsOf(null)).toEqual([]);
  });

  it("stops on a corrupt parent cycle", async () => {
    db.document.findUnique.mockResolvedValue({ id: 9, title: "Loop", public: true, parentId: 9 });
    expect((await ancestorsOf(9)).map(p => p.id)).toEqual([9]);
  });

  it("accepts a valid parent and null for the root", async () => {
    expect(await resolveParent(4, 1)).toBe(4);
    expect(await resolveParent("1")).toBe(1);
    expect(await resolveParent(null, 3)).toBeNull();
  });

  it.each([
    ["itself", 2, 2],
    ["one of its descendants", 3, 1],
    ["a missing page", 99, 1],
    ["a non-numeric id", "abc", 1],
  ])("rejects %s as parent with a 400", async (_label, parentId, documentId) => {
    await expect(resolveParent(parentId, documentId)).rejects.toMatchObject({ status: 400 });
  });
});

describe("document controller with sub-pages", () => {
  it("creates a page under a parent", async () => {
    await call(documents.createDocument, { title: "Sub", type: "TEXT", parentId: 1 });
    expect(db.document.create).toHaveBeenCalledWith({
      data: { title: "Sub", type: "TEXT", parent: { connect: { id: 1 } }, author: { connect: { id: 7 } } },
    });
  });

  it("moves a page to the root and refuses a cycle", async () => {
    db.document.findFirst.mockResolvedValue(pages[1]);
    await call(documents.updateDocument, { parentId: null });
    expect(db.document.update.mock.calls[0][0].data.parent).toEqual({ disconnect: true });

    db.document.update.mockClear();
    const ctx = await call(documents.updateDocument, { parentId: 3 }, { params: { id: "1" } });
    expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("returns breadcrumbs and children, hiding private ones from signed-out readers", async () => {
    const signedIn = await call(documents.getDocumentById, {}, { params: { id: "3" } });
    expect(signedIn.json.mock.calls[0][0]).toMatchObject({ ancestors: [{ id: 1 }, { id: 2 }], children: [] });

    const anonymous = await call(documents.getDocumentById, {}, { params: { id: "1" }, user: undefined });
    expect(anonymous.json.mock.calls[0][0].children).toEqual([]);
  });

  it("deletes the whole subtree's histories and images", async () => {
    await call(documents.deleteDocument, {}, { params: { id: "1" } });
    expect(db.documentHistory.deleteMany).toHaveBeenCalledWith({ where: { documentId: { in: [1, 2, 3] } } });
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(vi.mocked(removeDocumentImages).mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
  });
});
