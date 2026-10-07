import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({
  runTurn: vi.fn(),
  toDisplayMessages: vi.fn(),
  getAiConfig: vi.fn(),
  listTextModels: vi.fn(),
  listImageModels: vi.fn(),
  generateImage: vi.fn(),
  prepareImage: vi.fn(),
  storeImage: vi.fn(),
  removeImage: vi.fn(),
}));
vi.mock("../ai/agent", () => ({ runTurn: mocks.runTurn, toDisplayMessages: mocks.toDisplayMessages }));
vi.mock("../ai/openrouter", () => ({
  getAiConfig: mocks.getAiConfig,
  listTextModels: mocks.listTextModels,
  listImageModels: mocks.listImageModels,
  generateImage: mocks.generateImage,
}));
vi.mock("../utils/documentImageStorage", () => ({ prepareImage: mocks.prepareImage, storeImage: mocks.storeImage, removeImage: mocks.removeImage }));
import * as ai from "../controllers/aiController";

const config = { apiKey: "key", textModel: "provider/model", imageModel: "provider/image" };
const dataUrl = (mime: string, content: string) => `data:${mime};base64,${Buffer.from(content).toString("base64")}`;

/** A fake streaming response that records the SSE events and lets a test fire `close`. */
const streamingResponse = (overrides: Record<string, unknown> = {}) => {
  const written: string[] = [];
  const listeners: Record<string, () => void> = {};
  const res = {
    status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), flushHeaders: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => { listeners[event] = listener; }),
    write: vi.fn((chunk: string) => written.push(chunk)), end: vi.fn(), writableEnded: false, destroyed: false,
    ...overrides,
  };
  const events = () => written.map((w) => JSON.parse(w.replace(/^data: /, "")));
  return { res, events, listeners };
};
const send = (body: unknown, res: unknown) => {
  const next = vi.fn();
  return ai.sendMessage({ params: { id: "12" }, body, user: { id: 7, role: "USER" } } as never, res as never, next).then(() => next);
};

beforeEach(() => {
  resetDatabase();
  vi.clearAllMocks();
  mocks.getAiConfig.mockResolvedValue(config);
  mocks.toDisplayMessages.mockImplementation((rows: unknown[]) => rows.map((row) => ({ shown: row })));
  mocks.runTurn.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("models and status", () => {
  it("lists text and image models with the configured key", async () => {
    mocks.listTextModels.mockResolvedValue([{ id: "t" }]);
    mocks.listImageModels.mockResolvedValue([{ id: "i" }]);
    const { json } = await call(ai.getModels);
    expect(mocks.listTextModels).toHaveBeenCalledWith("key");
    expect(mocks.listImageModels).toHaveBeenCalledWith("key");
    expect(json).toHaveBeenCalledWith({ text: [{ id: "t" }], image: [{ id: "i" }] });
  });

  it("forwards a missing configuration to the error handler", async () => {
    mocks.getAiConfig.mockRejectedValue(Object.assign(new Error("Clé manquante"), { status: 400 }));
    const { next, json } = await call(ai.getModels);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(json).not.toHaveBeenCalled();
  });

  it("reports an unconfigured assistant when there are no settings", async () => {
    db.settings.findFirst.mockResolvedValue(null);
    expect((await call(ai.getAiStatus)).json).toHaveBeenCalledWith({ configured: false, textModel: null, imageModel: null });
  });

  it("reports the configured models without the key", async () => {
    db.settings.findFirst.mockResolvedValue({ openrouterApiKey: "secret", aiTextModel: "m", aiImageModel: null });
    const { json } = await call(ai.getAiStatus);
    expect(json).toHaveBeenCalledWith({ configured: true, textModel: "m", imageModel: null });
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("secret");
  });

  it("forwards database errors from the status", async () => {
    db.settings.findFirst.mockRejectedValue(new Error("down"));
    expect((await call(ai.getAiStatus)).next).toHaveBeenCalledWith(expect.objectContaining({ message: "down" }));
  });
});

describe("conversations", () => {
  const where = () => db.conversation.findMany.mock.calls[0][0].where;

  it("lists all of the user's conversations without a filter", async () => {
    db.conversation.findMany.mockResolvedValue([{ id: 1 }]);
    const { json } = await call(ai.listConversations);
    expect(where()).toEqual({ authorId: 7 });
    expect(json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it("filters global conversations with documentId=none", async () => {
    await call(ai.listConversations, {}, { query: { documentId: "none" } });
    expect(where()).toEqual({ authorId: 7, documentId: null });
  });

  it("filters a page's conversations", async () => {
    await call(ai.listConversations, {}, { query: { documentId: "4" } });
    expect(where()).toEqual({ authorId: 7, documentId: 4 });
  });

  it("rejects an invalid documentId", async () => {
    const { next } = await call(ai.listConversations, {}, { query: { documentId: "abc" } });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "documentId invalide" }));
    expect(db.conversation.findMany).not.toHaveBeenCalled();
  });

  it("creates a global conversation without looking up a page", async () => {
    db.conversation.create.mockResolvedValue({ id: 3, documentId: null });
    const { status, json } = await call(ai.createConversation, { documentId: null });
    expect(db.document.findUnique).not.toHaveBeenCalled();
    expect(db.conversation.create.mock.calls[0][0].data).toEqual({ documentId: null, authorId: 7 });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ id: 3, documentId: null });
  });

  it("creates a conversation linked to an existing page", async () => {
    await call(ai.createConversation, { documentId: "5" });
    expect(db.conversation.create.mock.calls[0][0].data).toEqual({ documentId: 5, authorId: 7 });
  });

  it("refuses to link a conversation to an unknown page", async () => {
    db.document.findUnique.mockResolvedValue(null);
    const { next } = await call(ai.createConversation, { documentId: 99 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: "Page introuvable" }));
    expect(db.conversation.create).not.toHaveBeenCalled();
  });

  it("returns a conversation with its page and display messages", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "T", document: { id: 3, title: "Notes", type: "TEXT" } });
    db.aiMessage.findMany.mockResolvedValue([{ id: 1 }]);
    const { json } = await call(ai.getConversation);
    expect(db.conversation.findFirst.mock.calls[0][0].where).toEqual({ id: 12, authorId: 7 });
    expect(json).toHaveBeenCalledWith({ id: 12, title: "T", document: { id: 3, title: "Notes", type: "TEXT" }, messages: [{ shown: { id: 1 } }] });
  });

  it("hides other users' conversations", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    for (const handler of [ai.getConversation, ai.renameConversation, ai.deleteConversation, ai.sendMessage]) {
      const { next } = await call(handler, { title: "x", text: "x" });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404, message: "Conversation introuvable" }));
    }
    expect(db.conversation.update).not.toHaveBeenCalled();
    expect(db.conversation.delete).not.toHaveBeenCalled();
  });

  it("renames with a trimmed title capped at 120 characters", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "T", document: null });
    db.conversation.update.mockResolvedValue({ id: 12, title: "ok" });
    const { json } = await call(ai.renameConversation, { title: `  ${"a".repeat(200)}  ` });
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { title: "a".repeat(120) } });
    expect(json).toHaveBeenCalledWith({ id: 12, title: "ok" });
  });

  it.each([{ title: "   " }, { title: 42 }, {}])("requires a title (%j)", async (body) => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "T", document: null });
    const { next } = await call(ai.renameConversation, body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "Titre requis" }));
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it("deletes the user's conversation", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "T", document: null });
    const { json } = await call(ai.deleteConversation);
    expect(db.conversation.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(json).toHaveBeenCalledWith({ success: true });
  });
});

describe("sendMessage", () => {
  const conversation = { id: 12, title: "Nouvelle conversation", document: { id: 3, title: "Notes", type: "TEXT" } };
  beforeEach(() => {
    db.conversation.findFirst.mockResolvedValue(conversation);
    db.userPermissions.findUnique.mockResolvedValue({ modifyDocument: true });
  });

  it("refuses a second message while a turn is running, then accepts it again", async () => {
    let finish!: () => void;
    mocks.runTurn.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const first = send({ text: "one" }, streamingResponse().res);
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalledOnce());

    const { res } = streamingResponse();
    const next = await send({ text: "two" }, res);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    expect(res.flushHeaders).not.toHaveBeenCalled();

    finish();
    await first;
    expect(await send({ text: "three" }, streamingResponse().res)).not.toHaveBeenCalled();
    expect(mocks.runTurn).toHaveBeenCalledTimes(2);
  });

  it("rejects more attachments than allowed before streaming", async () => {
    const { res } = streamingResponse();
    const attachments = Array.from({ length: 6 }, (_, i) => ({ name: `${i}.txt`, data: dataUrl("text/plain", "x") }));
    const next = await send({ text: "hi", attachments }, res);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "5 fichiers maximum par message." }));
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it("returns attachment conversion errors as plain JSON errors", async () => {
    const { res } = streamingResponse();
    const next = await send({ text: "hi", attachments: [{ name: "a.zip", data: dataUrl("application/zip", "zip") }] }, res);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 415 }));
    expect(res.flushHeaders).not.toHaveBeenCalled();
    expect(db.conversation.update).not.toHaveBeenCalled();
  });

  it("sends attachments only, without renaming the conversation", async () => {
    const { res, events } = streamingResponse();
    const next = await send({ attachments: [{ name: "notes.md", data: dataUrl("text/markdown", "# T") }] }, res);
    expect(next).not.toHaveBeenCalled();
    const turn = mocks.runTurn.mock.calls[0][0];
    expect(turn.userMessage).toEqual({ role: "user", content: [{ type: "text", text: "(voir les fichiers joints)" }, { type: "text", text: '<fichier nom="notes.md">\n# T\n</fichier>' }] });
    expect(turn.attachmentNames).toEqual(["notes.md"]);
    expect(turn.page).toEqual(conversation.document);
    expect(turn.ctx).toMatchObject({ userId: 7, isAdmin: false, permissions: { modifyDocument: true } });
    // Only the final `updated_at` touch, no title.
    expect(db.conversation.update).toHaveBeenCalledTimes(1);
    expect(db.conversation.update.mock.calls[0][0].data).toHaveProperty("updated_at");
    expect(events()).toEqual([{ type: "done", messages: [], changedDocumentIds: [], treeChanged: false }]);
  });

  it("titles a new conversation with the first 60 characters and streams emitted events", async () => {
    const { res, events } = streamingResponse();
    mocks.runTurn.mockImplementation(async ({ emit, ctx }) => {
      emit({ type: "text", text: "Ok" });
      ctx.changed.add(3);
      ctx.treeChanged = true;
    });
    db.aiMessage.findMany.mockResolvedValue([{ id: 1 }]);
    await send({ text: "b".repeat(80) }, res);
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { title: "b".repeat(60) } });
    expect(mocks.runTurn.mock.calls[0][0].userMessage).toEqual({ role: "user", content: "b".repeat(80) });
    expect(events()).toEqual([
      { type: "text", text: "Ok" },
      { type: "done", messages: [{ shown: { id: 1 } }], changedDocumentIds: [3], treeChanged: true },
    ]);
    expect(res.end).toHaveBeenCalled();
  });

  it("keeps an existing title", async () => {
    db.conversation.findFirst.mockResolvedValue({ ...conversation, title: "Déjà nommée" });
    await send({ text: "Salut" }, streamingResponse().res);
    expect(db.conversation.update).toHaveBeenCalledTimes(1);
    expect(db.conversation.update.mock.calls[0][0].data).not.toHaveProperty("title");
  });

  it("reports errors after streaming started with the pages already changed", async () => {
    const { res, events } = streamingResponse();
    mocks.runTurn.mockImplementation(async ({ ctx }) => {
      ctx.changed.add(5);
      throw new Error("Provider overloaded");
    });
    const next = await send({ text: "Salut" }, res);
    expect(next).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(events()).toEqual([{ type: "error", message: "Provider overloaded", messages: [], changedDocumentIds: [5], treeChanged: false }]);
    expect(res.end).toHaveBeenCalled();
  });

  it("still reports the error when reloading the conversation fails", async () => {
    const { res, events } = streamingResponse();
    mocks.runTurn.mockRejectedValue("boom");
    db.aiMessage.findMany.mockRejectedValue(new Error("db down"));
    await send({ text: "Salut" }, res);
    expect(events()).toEqual([{ type: "error", message: "Erreur" }]);
  });

  it("stops the model silently when the client closes the stream", async () => {
    const { res, events, listeners } = streamingResponse();
    let signal: AbortSignal | undefined;
    mocks.runTurn.mockImplementation(async (turn) => {
      signal = turn.signal;
      listeners.close();
      throw new Error("aborted");
    });
    await send({ text: "Salut" }, res);
    expect(signal?.aborted).toBe(true);
    expect(events()).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it("does not abort when the stream closes after it ended normally", async () => {
    const { res, listeners } = streamingResponse();
    let signal: AbortSignal | undefined;
    mocks.runTurn.mockImplementation(async (turn) => {
      signal = turn.signal;
      res.writableEnded = true;
      listeners.close();
    });
    await send({ text: "Salut" }, res);
    expect(signal?.aborted).toBe(false);
  });

  it("does not write to a destroyed response", async () => {
    const { res } = streamingResponse({ destroyed: true });
    mocks.runTurn.mockImplementation(async ({ emit }) => emit({ type: "text", text: "lost" }));
    await send({ text: "Salut" }, res);
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });
});

describe("generateImage", () => {
  const prepared = { data: Buffer.from("webp-bytes"), mimeType: "image/webp", width: 640, height: 480 };
  beforeEach(() => {
    db.document.findUnique.mockResolvedValue({ id: 3, type: "TEXT" });
    mocks.generateImage.mockResolvedValue(Buffer.from("raw"));
    mocks.prepareImage.mockResolvedValue(prepared);
  });

  it("requires a prompt", async () => {
    const { next } = await call(ai.generateImage, { prompt: "  ", documentId: 3 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "Décris l’image à générer." }));
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it("requires an existing page", async () => {
    db.document.findUnique.mockResolvedValue(null);
    const { next } = await call(ai.generateImage, { prompt: "chat", documentId: 99 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("only adds images to text pages", async () => {
    db.document.findUnique.mockResolvedValue({ id: 3, type: "EXCEL" });
    const { next } = await call(ai.generateImage, { prompt: "chat", documentId: 3 });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: "Les images sont réservées aux pages texte." }));
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it("generates, stores and records the image", async () => {
    db.documentImage.create.mockImplementation(async ({ data }) => data);
    const { status, json } = await call(ai.generateImage, { prompt: `  ${"chat ".repeat(20)}`, documentId: "3" });
    expect(mocks.generateImage).toHaveBeenCalledWith(config, "chat ".repeat(20).trim());
    expect(mocks.prepareImage).toHaveBeenCalledWith(Buffer.from("raw"));
    const imageId = mocks.storeImage.mock.calls[0][1];
    expect(imageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.storeImage).toHaveBeenCalledWith(3, imageId, prepared.data);
    const data = db.documentImage.create.mock.calls[0][0].data;
    expect(data).toEqual({ id: imageId, documentId: 3, filename: `ia-${"chat ".repeat(20).trim().slice(0, 60)}.webp`, mimeType: "image/webp", size: 10, width: 640, height: 480 });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ ...data, url: `/api/documents/3/images/${imageId}` });
    expect(mocks.removeImage).not.toHaveBeenCalled();
  });

  it("removes the stored file when the database insert fails", async () => {
    db.documentImage.create.mockRejectedValue(new Error("insert failed"));
    const { next, json } = await call(ai.generateImage, { prompt: "chat", documentId: 3 });
    expect(mocks.removeImage).toHaveBeenCalledWith(3, mocks.storeImage.mock.calls[0][1]);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "insert failed" }));
    expect(json).not.toHaveBeenCalled();
  });
});
