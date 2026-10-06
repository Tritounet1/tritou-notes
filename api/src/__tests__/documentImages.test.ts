import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { context, dispatch } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const storage = vi.hoisted(() => ({ prepare: vi.fn(), store: vi.fn(), remove: vi.fn(), path: vi.fn() }));
vi.mock("../utils/documentImageStorage", async importOriginal => ({
  ...await importOriginal<typeof import("../utils/documentImageStorage")>(),
  prepareImage: storage.prepare, storeImage: storage.store, removeImage: storage.remove, imagePath: storage.path, removeDocumentImages: vi.fn(),
}));
import { getDocumentImage, uploadDocumentImage } from "../controllers/documentImageController";
import documentRoutes from "../routes/documentRoutes";
const imageId = "fe4fa050-31a0-4c4c-a7bb-b5eedc34bb0d";
const image = { id: imageId, documentId: 12, width: 8, height: 4, mimeType: "image/webp", size: 48, filename: "photo.png", document: { public: false } };
function uploadContext(id = "12", file: unknown = { originalname: "photo.png", buffer: Buffer.from("image") }) {
  return context({}, { params: { id }, file });
}
beforeEach(() => {
  vi.resetAllMocks(); resetDatabase();
  db.document.findUnique.mockResolvedValue({ id: 12, type: "TEXT" });
  db.documentImage.create.mockImplementation(async ({ data }) => data);
  db.documentImage.findUnique.mockResolvedValue(image);
  storage.prepare.mockResolvedValue({ data: Buffer.from("webp"), width: 8, height: 4, mimeType: "image/webp" });
  storage.path.mockReturnValue("/isolated/images/photo.webp");
});

describe("document image uploads", () => {
  it("stores sanitized pixels with a generated ID and document-bound metadata", async () => {
    const ctx = uploadContext();
    await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    const data = db.documentImage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ documentId: 12, filename: "photo.png", mimeType: "image/webp", size: 4, width: 8, height: 4 });
    expect(data.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(storage.store).toHaveBeenCalledWith(12, data.id, Buffer.from("webp"));
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(ctx.json.mock.calls[0][0].url).toBe(`/api/documents/12/images/${data.id}`);
  });
  it.each(["0", "-1", "abc", "12abc", "1.2", "9007199254740992"])("rejects invalid document IDs %s", async id => {
    const ctx = uploadContext(id); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(db.documentImage.create).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing document", async () => {
    db.document.findUnique.mockResolvedValue(null);
    const ctx = uploadContext(); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.status).toHaveBeenCalledWith(404);
    expect(storage.prepare).not.toHaveBeenCalled();
  });
  it.each(["TODO", "EXCEL"])("rejects uploads to %s documents", async type => {
    db.document.findUnique.mockResolvedValue({ id: 12, type });
    const ctx = uploadContext(); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(storage.store).not.toHaveBeenCalled();
  });
  it("requires a file", async () => {
    const ctx = uploadContext(); delete ctx.req.file;
    await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.status).toHaveBeenCalledWith(400);
  });
  it("does not persist an invalid image", async () => {
    storage.prepare.mockRejectedValue(new Error("Invalid image"));
    const ctx = uploadContext(); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid image" }));
    expect(storage.store).not.toHaveBeenCalled();
  });
  it("does not create metadata if writing the file fails", async () => {
    storage.store.mockRejectedValue(new Error("Disk full"));
    const ctx = uploadContext(); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Disk full" }));
    expect(db.documentImage.create).not.toHaveBeenCalled();
  });
  it("removes the file if metadata creation fails", async () => {
    db.documentImage.create.mockRejectedValue(new Error("Database failure"));
    const ctx = uploadContext(); await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(storage.remove).toHaveBeenCalledWith(12, expect.any(String));
    expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Database failure" }));
  });
  it("limits original filenames without using them as storage paths", async () => {
    const ctx = uploadContext("12", { originalname: "../" + "a".repeat(300), buffer: Buffer.from("image") });
    await uploadDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(db.documentImage.create.mock.calls[0][0].data.filename).toHaveLength(255);
    expect(storage.store.mock.calls[0][1]).not.toContain("..");
  });
  it("checks permissions before consuming multipart uploads", async () => {
    db.userPermissions.findUnique.mockResolvedValue({ modifyDocument: false });
    const ctx = await dispatch(documentRoutes, "POST", "/12/images", { user: { id: 7, role: "USER" } });
    expect(ctx.status).toHaveBeenCalledWith(403);
    expect(db.document.findUnique).not.toHaveBeenCalled();
    expect(storage.store).not.toHaveBeenCalled();
  });
});

describe("private image reads", () => {
  async function read(overrides: Record<string, unknown> = {}, sendError?: Error) {
    const ctx = context({}, { params: { id: "12", imageId }, ...overrides });
    const set = vi.fn();
    const sendFile = vi.fn((_path, callback) => callback(sendError));
    Object.assign(ctx.res, { set, sendFile });
    await getDocumentImage(ctx.req, ctx.res as Response, ctx.next);
    return { ...ctx, set, sendFile };
  }
  it("serves a private image to an authenticated reader without caching", async () => {
    const ctx = await read();
    expect(ctx.sendFile).toHaveBeenCalledWith("/isolated/images/photo.webp", expect.any(Function));
    expect(ctx.set).toHaveBeenCalledWith(expect.objectContaining({ "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" }));
  });
  it("uses the canonical stored UUID for case-insensitive database matches", async () => {
    await read({ params: { id: "12", imageId: imageId.toUpperCase() } });
    expect(storage.path).toHaveBeenCalledWith(12, imageId);
  });
  it("serves images of public documents anonymously", async () => {
    db.documentImage.findUnique.mockResolvedValue({ ...image, document: { public: true } });
    expect((await read({ user: undefined })).sendFile).toHaveBeenCalledOnce();
  });
  it.each(["missing", "another document", "anonymous private"])("does not serve %s images", async failure => {
    if (failure === "missing") db.documentImage.findUnique.mockResolvedValue(null);
    if (failure === "another document") db.documentImage.findUnique.mockResolvedValue({ ...image, documentId: 99 });
    const ctx = await read(failure === "anonymous private" ? { user: undefined } : {});
    expect(ctx.status).toHaveBeenCalledWith(404);
    expect(ctx.sendFile).not.toHaveBeenCalled();
  });
  it.each(["../secret", "123", "../../file.webp"])("rejects unsafe file IDs %s", async bad => {
    expect((await read({ params: { id: "12", imageId: bad } })).status).toHaveBeenCalledWith(400);
  });
  it("rejects invalid document IDs", async () => {
    expect((await read({ params: { id: "12abc", imageId } })).status).toHaveBeenCalledWith(400);
  });
  it("returns 404 if the file is missing", async () => {
    expect((await read({}, Object.assign(new Error("Missing"), { code: "ENOENT" }))).status).toHaveBeenCalledWith(404);
  });
  it("forwards streaming failures after headers have been sent", async () => {
    const failure = new Error("Read failed");
    const ctx = context({}, { params: { id: "12", imageId } });
    Object.assign(ctx.res, { headersSent: true, set: vi.fn(), sendFile: (_path: string, callback: (error: Error) => void) => callback(failure) });
    await getDocumentImage(ctx.req, ctx.res, ctx.next);
    expect(ctx.next).toHaveBeenCalledWith(failure);
    expect(ctx.status).not.toHaveBeenCalled();
  });
  it("forwards filesystem failures before streaming", async () => {
    const failure = new Error("Read failed");
    expect((await read({}, failure)).next).toHaveBeenCalledWith(failure);
  });
  it("forwards database failures", async () => {
    db.documentImage.findUnique.mockRejectedValue(new Error("Database failed"));
    expect((await read()).next).toHaveBeenCalledWith(expect.objectContaining({ message: "Database failed" }));
  });
});
