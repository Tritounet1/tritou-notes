import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
vi.mock("../utils/utils", () => ({ decrypt: (value: string) => `plain:${value}`, encrypt: (value: string) => value }));
import { buildSystemPrompt, runTurn, toDisplayMessages } from "../ai/agent";
import { attachmentToPart } from "../ai/attachments";
import { chatCompletion, generateImage, getAiConfig } from "../ai/openrouter";
import { runTool, type ToolContext } from "../ai/tools";
import * as ai from "../controllers/aiController";

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
/** A streamed chat completion: SSE lines, split at awkward places like a real network. */
const stream = (...deltas: object[]) => {
  const text = [": OPENROUTER PROCESSING", ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}`), "data: [DONE]"].join("\n\n") + "\n\n";
  const bytes = new TextEncoder().encode(text);
  return {
    ok: true,
    status: 200,
    body: (async function* () {
      for (let i = 0; i < bytes.length; i += 37) yield bytes.slice(i, i + 37);
    })(),
  };
};
const dataUrl = (mime: string, content: string | Buffer) => `data:${mime};base64,${Buffer.from(content).toString("base64")}`;
const ctx = (overrides: Partial<ToolContext> = {}): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set(), ...overrides });
const config = { apiKey: "key", textModel: "provider/model", imageModel: "provider/image" };

beforeEach(() => {
  resetDatabase();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("attachments", () => {
  it("passes images and PDFs through and inlines text files", () => {
    expect(attachmentToPart({ name: "a.png", data: dataUrl("image/png", "png") })).toMatchObject({ type: "image_url" });
    expect(attachmentToPart({ name: "a.pdf", data: dataUrl("application/pdf", "%PDF") })).toEqual({
      type: "file", file: { filename: "a.pdf", file_data: dataUrl("application/pdf", "%PDF") },
    });
    expect(attachmentToPart({ name: "notes.md", data: dataUrl("", "# Titre") })).toEqual({ type: "text", text: '<fichier nom="notes.md">\n# Titre\n</fichier>' });
  });

  it("rejects unsupported, oversized and malformed files", () => {
    expect(() => attachmentToPart({ name: "a.zip", data: dataUrl("application/zip", "zip") })).toThrow(expect.objectContaining({ status: 415 }));
    expect(() => attachmentToPart({ name: "big.png", data: dataUrl("image/png", Buffer.alloc(10 * 1024 * 1024 + 1)) })).toThrow(expect.objectContaining({ status: 413 }));
    expect(() => attachmentToPart({ name: "x", data: "not a data url" })).toThrow("Fichier illisible");
  });
});

describe("OpenRouter client", () => {
  it("requires a key and decrypts it", async () => {
    db.settings.findFirst.mockResolvedValue({ openrouterApiKey: null });
    await expect(getAiConfig()).rejects.toMatchObject({ status: 400 });
    db.settings.findFirst.mockResolvedValue({ openrouterApiKey: "enc", aiTextModel: "m", aiImageModel: null });
    expect(await getAiConfig()).toEqual({ apiKey: "plain:enc", textModel: "m", imageModel: null });
  });

  it("streams text deltas and returns the assembled message", async () => {
    fetchMock.mockResolvedValue(stream({ role: "assistant", content: "Sal" }, { content: "ut" }, { content: "" }));
    const deltas: string[] = [];
    expect(await chatCompletion(config, [{ role: "user", content: "Bonjour" }], [], { onText: (t) => deltas.push(t) })).toEqual({ role: "assistant", content: "Salut" });
    expect(deltas).toEqual(["Sal", "ut"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "provider/model", messages: [{ role: "user", content: "Bonjour" }], tool_choice: "auto", stream: true });
  });

  it("rebuilds fragmented tool calls and keeps reasoning details for the next call", async () => {
    fetchMock.mockResolvedValue(stream(
      { reasoning_details: [{ type: "reasoning.text", index: 0, text: "Je " }] },
      { reasoning_details: [{ type: "reasoning.text", index: 0, text: "cherche" }, { type: "reasoning.encrypted", data: "sig", index: 0 }] },
      { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "list_pages", arguments: "" } }] },
      { tool_calls: [{ index: 0, function: { arguments: '{"que' } }] },
      { tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }, { index: 1, id: "c2", function: { name: "read_page", arguments: '{"id":3}' } }] },
    ));
    expect(await chatCompletion(config, [], [])).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "list_pages", arguments: '{"query":"x"}' } },
        { id: "c2", type: "function", function: { name: "read_page", arguments: '{"id":3}' } },
      ],
      reasoning_details: [{ type: "reasoning.text", index: 0, text: "Je cherche" }, { type: "reasoning.encrypted", data: "sig", index: 0 }],
    });
  });

  it("surfaces errors sent inside the stream", async () => {
    fetchMock.mockResolvedValue({ ...stream(), body: (async function* () { yield new TextEncoder().encode('data: {"error":{"message":"Provider overloaded"}}\n\n'); })() });
    await expect(chatCompletion(config, [], [])).rejects.toThrow("OpenRouter : Provider overloaded");
  });

  it("maps OpenRouter errors and missing models to readable errors", async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: "Insufficient credits" } }, 402));
    await expect(chatCompletion(config, [], [])).rejects.toMatchObject({ status: 400, message: "OpenRouter : Insufficient credits" });
    await expect(chatCompletion({ ...config, textModel: null }, [], [])).rejects.toMatchObject({ status: 400 });
  });

  it("decodes generated images from b64_json or data URLs", async () => {
    fetchMock.mockResolvedValueOnce(reply({ data: [{ b64_json: Buffer.from("img").toString("base64") }] }));
    expect((await generateImage(config, "un chat")).toString()).toBe("img");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: "provider/image", prompt: "un chat", n: 1 });
    fetchMock.mockResolvedValueOnce(reply({ data: [{ url: dataUrl("image/png", "img2") }] }));
    expect((await generateImage(config, "un chien")).toString()).toBe("img2");
    fetchMock.mockResolvedValueOnce(reply({ data: [] }));
    await expect(generateImage(config, "rien")).rejects.toThrow("aucune image");
  });
});

describe("tools", () => {
  const page = { id: 3, title: "Notes", type: "TEXT", text: "Intro\nAncien paragraphe\nFin", parentId: null, public: false };

  it("edits a unique passage and records a history entry", async () => {
    db.document.findUnique.mockResolvedValue(page);
    db.document.findFirst.mockResolvedValue(page);
    const context = ctx();
    const result = await runTool("edit_page", JSON.stringify({ id: 3, old_text: "Ancien paragraphe", new_text: "Nouveau $& paragraphe" }), context);
    expect(result).toMatchObject({ ok: true, summary: "Page modifiée : « Notes »" });
    expect(db.documentHistory.create).toHaveBeenCalledOnce();
    // `$&` stays literal: replacement strings are not interpreted.
    expect(db.document.update.mock.calls[0][0].data.text).toBe("Intro\nNouveau $& paragraphe\nFin");
    expect([...context.changed]).toEqual([3]);
  });

  it("returns recoverable errors instead of throwing", async () => {
    db.document.findUnique.mockResolvedValue(page);
    expect(await runTool("edit_page", JSON.stringify({ id: 3, old_text: "absent", new_text: "x" }), ctx())).toMatchObject({ ok: false });
    expect(await runTool("edit_page", "{not json", ctx())).toMatchObject({ ok: false, summary: "Échec de edit_page : arguments invalides" });
    expect(await runTool("nope", "{}", ctx())).toMatchObject({ ok: false });
    db.document.findUnique.mockResolvedValue({ ...page, type: "EXCEL" });
    expect(await runTool("append_to_page", JSON.stringify({ id: 3, text: "x" }), ctx())).toMatchObject({ ok: false });
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("enforces the user's permissions", async () => {
    db.document.findUnique.mockResolvedValue(page);
    const readOnly = ctx({ isAdmin: false, permissions: { modifyDocument: false, createDocument: false } as ToolContext["permissions"] });
    expect(await runTool("append_to_page", JSON.stringify({ id: 3, text: "x" }), readOnly)).toMatchObject({ ok: false });
    expect(await runTool("create_page", JSON.stringify({ title: "Nouvelle" }), readOnly)).toMatchObject({ ok: false });
    expect(await runTool("read_page", JSON.stringify({ id: 3 }), readOnly)).toMatchObject({ ok: true });
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("creates a sub-page and links it from a text parent", async () => {
    db.document.findUnique.mockResolvedValue(page);
    db.document.findFirst.mockResolvedValue(page);
    db.document.create.mockResolvedValue({ id: 9, title: "Sous-page", parentId: 3 });
    const context = ctx();
    expect(await runTool("create_page", JSON.stringify({ title: "Sous-page", parentId: 3 }), context)).toMatchObject({ ok: true });
    expect(db.document.update.mock.calls[0][0].data.text).toBe(`${page.text}\n::page[9]::\n`);
    expect([...context.changed].sort()).toEqual([3, 9]);
  });
});

describe("structured page tools", () => {
  const todoPage = {
    id: 5, title: "Courses", type: "TODO", parentId: null, public: false,
    text: JSON.stringify({ todos: [{ id: "a1", title: "Pain", description: "", completed: false, createdAt: "2026-01-01" }, { id: "b2", title: "Lait", description: "", completed: false, createdAt: "2026-01-01" }] }),
  };

  it("reads to-dos and spreadsheets as structured data", async () => {
    db.document.findUnique.mockResolvedValue(todoPage);
    const result = await runTool("read_page", '{"id":5}', ctx());
    expect(result.output).toMatchObject({ type: "TODO", todos: [{ id: "a1", title: "Pain" }, { id: "b2" }] });
    expect(result.output).not.toHaveProperty("text");
  });

  it("adds, updates and removes to-dos in the editor's format", async () => {
    db.document.findUnique.mockResolvedValue(todoPage);
    db.document.findFirst.mockResolvedValue(todoPage);
    const result = await runTool("update_todos", JSON.stringify({ id: 5, add: [{ title: "Œufs" }], update: [{ id: "a1", completed: true }], remove: ["b2"] }), ctx());
    expect(result).toMatchObject({ ok: true, summary: "To-do « Courses » : 1 ajoutée(s), 1 modifiée(s), 1 supprimée(s)" });
    const { todos } = JSON.parse(db.document.update.mock.calls[0][0].data.text);
    expect(todos).toMatchObject([{ id: "a1", title: "Pain", completed: true }, { title: "Œufs", description: "", completed: false }]);
    expect(todos[1].id).toMatch(/^[a-z0-9]+$/);
  });

  it("refuses unknown to-do ids and the wrong page type", async () => {
    db.document.findUnique.mockResolvedValue(todoPage);
    expect(await runTool("update_todos", JSON.stringify({ id: 5, remove: ["zz"] }), ctx())).toMatchObject({ ok: false });
    expect(await runTool("set_cells", JSON.stringify({ id: 5, cells: { A1: "x" } }), ctx())).toMatchObject({ ok: false });
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("writes values and formulas, clears cells and rejects out-of-grid references", async () => {
    const sheet = { id: 6, title: "Budget", type: "EXCEL", parentId: null, public: false, text: JSON.stringify({ A1: { value: "Old" }, C3: { value: "x" } }) };
    db.document.findUnique.mockResolvedValue(sheet);
    db.document.findFirst.mockResolvedValue(sheet);
    expect(await runTool("set_cells", JSON.stringify({ id: 6, cells: { a1: "Mois", B2: "=SUM(B3:B4)", C3: "" } }), ctx())).toMatchObject({ ok: true });
    expect(JSON.parse(db.document.update.mock.calls[0][0].data.text)).toEqual({ A1: { value: "Mois" }, B2: { value: "", formula: "=SUM(B3:B4)" } });
    expect(await runTool("set_cells", JSON.stringify({ id: 6, cells: { AA1: "x", B51: "y" } }), ctx())).toMatchObject({ ok: false, summary: expect.stringContaining("AA1, B51") });
  });
});

describe("agent", () => {
  it("mentions the current page in the system prompt", () => {
    expect(buildSystemPrompt({ id: 3, title: "Notes", type: "TEXT" })).toContain("page #3 « Notes »");
    expect(buildSystemPrompt(null)).toContain("Aucune page n’est ouverte");
  });

  it("loops through tool calls until the model answers", async () => {
    db.aiMessage.findMany.mockResolvedValue([]);
    db.document.findUnique.mockResolvedValue({ id: 3, title: "Notes", type: "TEXT", text: "x", parentId: null, public: false });
    fetchMock
      .mockResolvedValueOnce(stream({ tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "read_page", arguments: '{"id":3}' } }] }))
      .mockResolvedValueOnce(stream({ content: "C’est une page " }, { content: "de notes." }));
    const events: unknown[] = [];
    await runTurn({ conversationId: 1, page: null, userMessage: { role: "user", content: "Résume #3" }, attachmentNames: [], ctx: ctx(), config, emit: (e) => events.push(e) });
    expect(events).toEqual([
      { type: "tool", name: "read_page" },
      { type: "action", summary: "Page lue : « Notes »", ok: true },
      { type: "text", text: "C’est une page " },
      { type: "text", text: "de notes." },
    ]);

    const saved = db.aiMessage.create.mock.calls.map(([{ data }]) => [data.role, data.summary]);
    expect(saved).toEqual([["user", null], ["assistant", null], ["tool", "Page lue : « Notes »"], ["assistant", null]]);
    // The second model call sees the tool result.
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondRequest.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("folds tool steps into one assistant bubble", () => {
    const row = (id: number, data: unknown, summary: string | null = null) => ({ id, role: "", data: data as never, summary, created_at: new Date(0) });
    const display = toDisplayMessages([
      row(1, { role: "user", content: [{ type: "text", text: "Lis ça" }, { type: "text", text: '<fichier nom="a.md">\nx\n</fichier>' }] }, "a.md"),
      row(2, { role: "assistant", content: null, tool_calls: [{ id: "c1" }] }),
      row(3, { role: "tool", tool_call_id: "c1", content: "{}" }, "Page lue : « A »"),
      row(4, { role: "tool", tool_call_id: "c2", content: "{}" }, "Échec de edit_page : introuvable"),
      row(5, { role: "assistant", content: "Fait." }),
    ]);
    expect(display).toMatchObject([
      { role: "user", text: "Lis ça", attachments: ["a.md"] },
      { role: "assistant", text: "Fait.", actions: [{ summary: "Page lue : « A »", ok: true }, { summary: "Échec de edit_page : introuvable", ok: false }] },
    ]);
  });
});

describe("AI controller", () => {
  it("hides other users' conversations", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    const result = await call(ai.getConversation);
    expect(db.conversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, authorId: 7 } }));
    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  });

  it("titles a new conversation and streams the reply as server-sent events", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "Nouvelle conversation", document: null });
    db.settings.findFirst.mockResolvedValue({ openrouterApiKey: "enc", aiTextModel: "m" });
    db.aiMessage.findMany.mockResolvedValue([]);
    fetchMock.mockResolvedValue(stream({ content: "Bonjour !" }));
    const written: string[] = [];
    const res = {
      status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), flushHeaders: vi.fn(), on: vi.fn(),
      write: vi.fn((chunk: string) => written.push(chunk)), end: vi.fn(), writableEnded: false, destroyed: false,
    };
    const next = vi.fn();
    await ai.sendMessage({ params: { id: "12" }, body: { text: "Salut, peux-tu m’aider ?" }, user: { id: 7, role: "ADMIN" } } as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { title: "Salut, peux-tu m’aider ?" } });
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ "Content-Type": "text/event-stream; charset=utf-8" }));
    expect(written.map((w) => JSON.parse(w.replace(/^data: /, "")))).toEqual([
      { type: "text", text: "Bonjour !" },
      { type: "done", messages: [], changedDocumentIds: [], treeChanged: false },
    ]);
    expect(res.end).toHaveBeenCalled();
  });

  it("rejects empty messages before calling OpenRouter", async () => {
    db.conversation.findFirst.mockResolvedValue({ id: 12, title: "x", document: null });
    const result = await call(ai.sendMessage, { text: "  " });
    expect(result.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Message vide" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
