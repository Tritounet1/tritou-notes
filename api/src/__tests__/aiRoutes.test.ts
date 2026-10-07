import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const handlers = vi.hoisted(() => ({ ok: vi.fn((_req: unknown, res: { json: (body: unknown) => void }) => res.json({ ok: true })) }));
vi.mock("../controllers/aiController", () => Object.fromEntries(["createConversation", "deleteConversation", "generateImage", "getAiStatus", "getConversation", "getModels", "listConversations", "renameConversation", "sendMessage"].map((name) => [name, handlers.ok])));
vi.mock("../middlewares/permissionsMiddleware", () => ({ requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
import ai from "../routes/aiRoutes";

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use("/api/ai", ai);
  app.use((error: { status?: number }, _req: unknown, res: { status: (n: number) => { end: () => void } }, _next: unknown) => res.status(error.status ?? 500).end());
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const post = (path: string, size: number, method = "POST") =>
  fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(size) }) });

it("accepts large bodies only on the messages route (attachments)", async () => {
  expect((await post("/conversations/3/messages", 2_000_000)).status).toBe(200);
  expect((await post("/conversations/3", 2_000_000, "PATCH")).status).toBe(413);
  expect((await post("/images", 2_000_000)).status).toBe(413);
  expect((await post("/conversations", 1_000)).status).toBe(200);
});
