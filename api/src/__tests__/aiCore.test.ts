import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
vi.mock("../utils/utils", () => ({ decrypt: (value: string) => `plain:${value}`, encrypt: (value: string) => value }));
import { buildSystemPrompt, MAX_STEPS, repairHistory, runTurn, toDisplayMessages } from "../ai/agent";
import { attachmentToPart } from "../ai/attachments";
import { chatCompletion, generateImage, getAiConfig, listImageModels, listTextModels } from "../ai/openrouter";
import type { ToolContext } from "../ai/tools";

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const sse = (lines: string[]) => {
  const bytes = new TextEncoder().encode(lines.join("\n\n") + "\n\n");
  return {
    ok: true,
    status: 200,
    body: (async function* () {
      for (let i = 0; i < bytes.length; i += 23) yield bytes.slice(i, i + 23);
    })(),
  };
};
/** A streamed chat completion made of `delta` events. */
const stream = (...deltas: object[]) => sse([": OPENROUTER PROCESSING", ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}`), "data: [DONE]"]);
const ctx = (): ToolContext => ({ userId: 7, isAdmin: true, permissions: null, changed: new Set() });
const config = { apiKey: "key", textModel: "provider/model", imageModel: "provider/image" };
const dataUrl = (mime: string, content: string) => `data:${mime};base64,${Buffer.from(content).toString("base64")}`;

beforeEach(() => {
  resetDatabase();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getAiConfig", () => {
  it("rejects missing settings and defaults models to null", async () => {
    db.settings.findFirst.mockResolvedValue(null);
    await expect(getAiConfig()).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Aucune clé OpenRouter") });
    db.settings.findFirst.mockResolvedValue({ openrouterApiKey: "enc" });
    expect(await getAiConfig()).toEqual({ apiKey: "plain:enc", textModel: null, imageModel: null });
  });
});

describe("model listings", () => {
  const raw = [
    { id: "z/zeta", name: "Zeta", context_length: 8000, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, pricing: { prompt: "0.000001", completion: "0.000002" } },
    { id: "a/alpha", pricing: { prompt: "abc", completion: "0.1" } },
    { id: "a/alpha:batch", name: "Alpha batch" },
    { id: "i/image-only", name: "Imagen", architecture: { output_modalities: ["image"] } },
    { id: "b/beta", name: "Beta", architecture: { output_modalities: ["image", "text"] } },
  ];

  it("keeps interactive text models, converts prices per million and sorts by name", async () => {
    fetchMock.mockResolvedValue(reply({ data: raw }));
    const models = await listTextModels("key");
    expect(models).toEqual([
      { id: "a/alpha", name: "a/alpha", inputModalities: ["text"], contextLength: null, pricing: null },
      { id: "b/beta", name: "Beta", inputModalities: ["text"], contextLength: null, pricing: null },
      { id: "z/zeta", name: "Zeta", inputModalities: ["text", "image"], contextLength: 8000, pricing: { prompt: expect.closeTo(1, 6), completion: expect.closeTo(2, 6) } },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/models?supported_parameters=tools");
    expect(init.headers).toMatchObject({ Authorization: "Bearer key", "X-Title": "Tritou Notes" });
  });

  it("lists image models without filtering", async () => {
    fetchMock.mockResolvedValue(reply({ data: raw }));
    expect((await listImageModels("key")).map((m) => m.id)).toEqual(["a/alpha", "a/alpha:batch", "b/beta", "i/image-only", "z/zeta"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images/models");
  });

  it("maps HTTP errors: auth and credits become 400, the rest 502", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { message: "Bad key" } }, 401));
    await expect(listTextModels("key")).rejects.toMatchObject({ status: 400, message: "OpenRouter : Bad key" });
    fetchMock.mockResolvedValueOnce(reply({}, 402));
    await expect(listTextModels("key")).rejects.toMatchObject({ status: 400, message: "OpenRouter : OpenRouter a répondu 402" });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => { throw new SyntaxError("html"); } });
    await expect(listImageModels("key")).rejects.toMatchObject({ status: 502, message: "OpenRouter : OpenRouter a répondu 503" });
  });
});

describe("generateImage", () => {
  it("requires an image model and rejects non-data URLs", async () => {
    await expect(generateImage({ ...config, imageModel: null }, "x")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Aucun modèle d’image") });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply({ data: [{ url: "https://cdn.example/img.png" }] }));
    await expect(generateImage(config, "x")).rejects.toMatchObject({ status: 502, message: "Le modèle d’image n’a renvoyé aucune image" });
    fetchMock.mockResolvedValueOnce(reply({}));
    await expect(generateImage(config, "x")).rejects.toThrow("aucune image");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
});

describe("chatCompletion", () => {
  it("maps non-ok responses before streaming", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: { message: "Rate limited" } }, 429));
    await expect(chatCompletion(config, [], [])).rejects.toMatchObject({ status: 502, message: "OpenRouter : Rate limited" });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => { throw new Error("no json"); } });
    await expect(chatCompletion(config, [], [])).rejects.toMatchObject({ status: 400, message: "OpenRouter : OpenRouter a répondu 401" });
    // ok but without a body to stream.
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, body: null, json: async () => ({}) });
    await expect(chatCompletion(config, [], [])).rejects.toMatchObject({ status: 502, message: "OpenRouter : OpenRouter a répondu 200" });
  });

  it("combines the caller's abort signal with the timeout", async () => {
    fetchMock.mockResolvedValue(stream({ content: "ok" }));
    const controller = new AbortController();
    await chatCompletion(config, [], [], { signal: controller.signal });
    const { signal } = fetchMock.mock.calls[0][1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("skips events without a delta and reports stream errors without a message", async () => {
    fetchMock.mockResolvedValueOnce(sse(['data: {"choices":[]}', "event: ping", `data: ${JSON.stringify({ choices: [{ delta: { content: "A" } }] })}`, "data: [DONE]"]));
    expect(await chatCompletion(config, [], [])).toEqual({ role: "assistant", content: "A" });
    fetchMock.mockResolvedValueOnce(sse(['data: {"error":{}}']));
    await expect(chatCompletion(config, [], [])).rejects.toThrow("OpenRouter : erreur pendant la génération");
  });

  it("returns an empty message when the stream ends without [DONE]", async () => {
    fetchMock.mockResolvedValueOnce(sse([": keep-alive"]));
    expect(await chatCompletion(config, [], [])).toEqual({ role: "assistant", content: null });
  });

  it("assembles tool calls sent without index, by id and as continuations", async () => {
    fetchMock.mockResolvedValue(stream(
      { tool_calls: [{ id: "c1", function: { name: "list_pages", arguments: '{"qu' } }] },
      { tool_calls: [{ function: { arguments: 'ery":"a"}' } }] },
      { tool_calls: [{ id: "c2", function: { name: "read_page", arguments: "" } }] },
      // Same id again: extends c1, and a repeated name is not appended.
      { tool_calls: [{ id: "c1", function: { name: "list_pages" } }] },
      { tool_calls: [{ id: "c2", function: { arguments: '{"id":1}' } }] },
    ));
    expect((await chatCompletion(config, [], [])).tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "list_pages", arguments: '{"query":"a"}' } },
      { id: "c2", type: "function", function: { name: "read_page", arguments: '{"id":1}' } },
    ]);
  });

  it("drops holes left by sparse tool call indexes", async () => {
    fetchMock.mockResolvedValue(stream({ tool_calls: [{ index: 1, id: "c9", function: { name: "list_pages", arguments: "{}" } }] }));
    expect((await chatCompletion(config, [], [])).tool_calls).toEqual([{ id: "c9", type: "function", function: { name: "list_pages", arguments: "{}" } }]);
  });

  it("merges reasoning summaries and keeps distinct blocks apart", async () => {
    fetchMock.mockResolvedValue(stream(
      { reasoning_details: [{ type: "reasoning.summary", index: 0, summary: "Lire " }] },
      { reasoning_details: [{ type: "reasoning.summary", index: 0, summary: "la page" }] },
      { reasoning_details: [{ type: "reasoning.summary", index: 1, summary: "Puis" }] },
      { reasoning_details: [{ type: "reasoning.text", index: 1, text: "texte" }] },
      { reasoning_details: [{ type: "reasoning.encrypted", index: 1, data: "a" }] },
      { reasoning_details: [{ type: "reasoning.encrypted", index: 1, data: "b" }] },
    ));
    expect((await chatCompletion(config, [], [])).reasoning_details).toEqual([
      { type: "reasoning.summary", index: 0, summary: "Lire la page" },
      { type: "reasoning.summary", index: 1, summary: "Puis" },
      { type: "reasoning.text", index: 1, text: "texte" },
      { type: "reasoning.encrypted", index: 1, data: "a" },
      { type: "reasoning.encrypted", index: 1, data: "b" },
    ]);
  });
});

describe("buildSystemPrompt", () => {
  it("names untitled pages and includes the French date", () => {
    const prompt = buildSystemPrompt({ id: 4, title: "", type: "EXCEL" }, new Date(2026, 2, 15, 12));
    expect(prompt).toContain("page #4 « Sans titre » (type EXCEL)");
    expect(prompt).toContain("Date du jour : dimanche 15 mars 2026.");
    expect(prompt).not.toContain("Aucune page n’est ouverte");
  });
});

describe("repairHistory", () => {
  const call = (id: string) => ({ id, type: "function" as const, function: { name: "read_page", arguments: "{}" } });
  it("keeps a valid history unchanged", () => {
    const history = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: null, tool_calls: [call("a")] },
      { role: "tool" as const, tool_call_id: "a", content: "{}" },
      { role: "assistant" as const, content: "done" },
    ];
    expect(repairHistory(history)).toEqual(history);
  });
  it("adds missing tool results and drops stray ones", () => {
    const repaired = repairHistory([
      { role: "tool", tool_call_id: "orphan", content: "{}" },
      { role: "assistant", content: null, tool_calls: [call("a"), call("b")] },
      { role: "tool", tool_call_id: "b", content: "\"b\"" },
      { role: "user", content: "again" },
    ]);
    expect(repaired.map((m) => m.role)).toEqual(["assistant", "tool", "tool", "user"]);
    expect(repaired[1]).toEqual({ role: "tool", tool_call_id: "a", content: expect.stringContaining("interrompue") });
    expect(repaired[2]).toEqual({ role: "tool", tool_call_id: "b", content: "\"b\"" });
  });
});

describe("toDisplayMessages", () => {
  const row = (id: number, data: unknown, summary: string | null = null) => ({ id, role: "", data: data as never, summary, created_at: new Date(id) });

  it("handles string content, empty summaries, leading tool rows and successive answers", () => {
    const display = toDisplayMessages([
      row(1, { role: "tool", tool_call_id: "c0", content: "{}" }, "Page lue : « A »"),
      row(2, { role: "user", content: "Bonjour" }, ""),
      row(3, { role: "system", content: "ignored" }),
      row(4, { role: "assistant", content: "Première partie." }),
      row(5, { role: "tool", tool_call_id: "c1", content: "{}" }),
      row(6, { role: "assistant", content: "Seconde partie." }),
      row(7, { role: "assistant", content: "" }),
      row(8, { role: "user", content: null }),
    ]);
    expect(display).toEqual([
      { id: 1, role: "assistant", text: "", attachments: [], actions: [{ summary: "Page lue : « A »", ok: true }], created_at: new Date(1) },
      { id: 2, role: "user", text: "Bonjour", attachments: [], actions: [], created_at: new Date(2) },
      { id: 4, role: "assistant", text: "Première partie.\n\nSeconde partie.", attachments: [], actions: [], created_at: new Date(4) },
      { id: 8, role: "user", text: "", attachments: [], actions: [], created_at: new Date(8) },
    ]);
  });

  it("keeps several attachment names and skips image parts in user text", () => {
    const [message] = toDisplayMessages([
      row(1, { role: "user", content: [{ type: "image_url", image_url: { url: "data:" } }, { type: "text", text: "Vois" }, { type: "text", text: "ça" }] }, "a.png\nb.pdf"),
    ]);
    expect(message).toMatchObject({ text: "Vois\nça", attachments: ["a.png", "b.pdf"] });
  });
});

describe("runTurn", () => {
  it("stops after MAX_STEPS model calls and saves a final notice", async () => {
    db.aiMessage.findMany.mockResolvedValue([]);
    fetchMock.mockImplementation(async () => stream({ tool_calls: [{ index: 0, id: "c", function: { name: "list_pages", arguments: "{}" } }] }));
    await runTurn({ conversationId: 1, page: null, userMessage: { role: "user", content: "Boucle" }, attachmentNames: [], ctx: ctx(), config });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_STEPS);
    const saved = db.aiMessage.create.mock.calls.map(([{ data }]) => data);
    expect(saved).toHaveLength(1 + MAX_STEPS * 2 + 1);
    expect(saved.filter((d) => d.role === "tool").every((d) => d.summary === "0 page listée")).toBe(true);
    expect(saved[saved.length - 1]).toEqual({
      conversationId: 1,
      role: "assistant",
      data: { role: "assistant", content: "J’ai atteint la limite d’actions pour ce message. Dis « continue » pour que je poursuive." },
      summary: null,
    });
  });

  it("replays the history, stores attachment names and works without emit", async () => {
    db.aiMessage.findMany.mockResolvedValue([{ data: { role: "user", content: "Avant" } }, { data: { role: "assistant", content: "Réponse" } }]);
    fetchMock.mockResolvedValue(stream({ content: "OK" }));
    const userMessage = { role: "user" as const, content: "Et maintenant ?" };
    await runTurn({ conversationId: 2, page: { id: 3, title: "Notes", type: "TEXT" }, userMessage, attachmentNames: ["a.md", "b.png"], ctx: ctx(), config, signal: new AbortController().signal });
    expect(db.aiMessage.findMany).toHaveBeenCalledWith({ where: { conversationId: 2 }, orderBy: { id: "asc" } });
    const { messages } = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(messages.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(messages[0].content).toContain("page #3 « Notes »");
    expect(db.aiMessage.create.mock.calls[0][0].data).toMatchObject({ role: "user", summary: "a.md\nb.png" });
    expect(db.aiMessage.create.mock.calls[1][0].data).toMatchObject({ role: "assistant", data: { role: "assistant", content: "OK" } });
  });
});

describe("attachmentToPart", () => {
  it("inlines JSON and text/* files, escaping quotes in names", () => {
    expect(attachmentToPart({ name: 'say "hi".bin', data: dataUrl("application/json", "{}") })).toEqual({ type: "text", text: "<fichier nom=\"say 'hi'.bin\">\n{}\n</fichier>" });
    expect(attachmentToPart({ name: "x.bin", data: dataUrl("text/plain", "ok") })).toMatchObject({ type: "text" });
    expect(attachmentToPart({ name: "photo.jpg", data: "data:image/jpeg;name=photo.jpg;base64,AAAA" })).toMatchObject({ type: "image_url" });
  });

  it("rejects a non-text file name", () => {
    expect(() => attachmentToPart({ name: { toString: null } as unknown as string, data: "data:text/plain;base64,eA==" })).toThrow(expect.objectContaining({ status: 400, message: "Pièce jointe sans nom valide." }));
  });
  it("rejects a missing data URL", () => {
    expect(() => attachmentToPart({ name: "x", data: undefined as unknown as string })).toThrow(expect.objectContaining({ status: 400, message: "Fichier illisible : x" }));
  });
});
