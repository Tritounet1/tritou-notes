import type { AddressInfo } from "node:net";
import { once } from "node:events";
import type { Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
vi.mock("../config/queue", () => ({ scrapeQueue: { add: vi.fn(), upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn() } }));
import { createMcpApp } from "../mcp/http";
import { authorize, buildServer, MCP_INSTRUCTIONS, stdioUser } from "../mcp/server";
import { hashMcpToken } from "../utils/mcpToken";

const TOKEN = "tritou_mcp_test";
const withToken = (overrides: Record<string, unknown> = {}) =>
  db.settings.findFirst.mockResolvedValue({ mcpTokenHash: hashMcpToken(TOKEN), mcpTokenUserId: 7, ...overrides });

const connect = async (userId = 7) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await buildServer(userId).connect(serverTransport);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientTransport);
  return client;
};

beforeEach(() => {
  resetDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("authorize", () => {
  it("returns the token's user for the right bearer token", async () => {
    withToken();
    expect(await authorize(`Bearer ${TOKEN}`)).toBe(7);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it("fails closed", async () => {
    withToken();
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize("Basic abc")).toBeNull();
    expect(await authorize("Bearer wrong")).toBeNull();
    withToken({ mcpTokenHash: null });
    expect(await authorize(`Bearer ${TOKEN}`)).toBeNull();
    // Token generated before it was tied to a user: regenerate it.
    withToken({ mcpTokenUserId: null });
    expect(await authorize(`Bearer ${TOKEN}`)).toBeNull();
    withToken();
    db.user.findUnique.mockResolvedValue(null);
    expect(await authorize(`Bearer ${TOKEN}`)).toBeNull();
    db.settings.findFirst.mockResolvedValue(null);
    expect(await authorize(`Bearer ${TOKEN}`)).toBeNull();
  });

  it("gives stdio the token's user", async () => {
    withToken();
    expect(await stdioUser()).toBe(7);
    db.settings.findFirst.mockResolvedValue(null);
    expect(await stdioUser()).toBeNull();
  });
});

describe("MCP server", () => {
  it("lists the assistant's tools with the workspace guide", async () => {
    const client = await connect();
    expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["list_pages", "edit_page", "update_scheduler", "run_scrape", "delete_page"]));
    expect(tools.find((t) => t.name === "edit_page")?.inputSchema).toMatchObject({ type: "object", required: ["id", "old_text", "new_text"] });
    await client.close();
  });

  it("runs tools as the token's user, with their current permissions", async () => {
    db.user.findUnique.mockResolvedValue({ ...user, role: "USER" });
    db.userPermissions.findUnique.mockResolvedValue({ accessScrapersPage: false });
    const client = await connect();
    const denied = await client.callTool({ name: "list_scrapers", arguments: {} });
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain("accessScrapersPage");

    db.user.findUnique.mockResolvedValue(user);
    db.scraper.findMany.mockResolvedValue([{ id: 1, name: "Shop" }]);
    const listed = await client.callTool({ name: "list_scrapers" });
    expect(listed.isError).toBe(false);
    expect(JSON.parse((listed.content as { text: string }[])[0].text)).toEqual([{ id: 1, name: "Shop" }]);
    await client.close();
  });

  it("refuses calls once the token's user is deleted", async () => {
    const client = await connect();
    db.user.findUnique.mockResolvedValue(null);
    await expect(client.callTool({ name: "list_pages", arguments: {} })).rejects.toThrow("n’existe plus");
    await client.close();
  });
});

describe("MCP over HTTP", () => {
  let server: HttpServer | undefined;
  const start = async () => {
    server = createMcpApp().listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;
  });
  const rpc = (base: string, auth?: string) =>
    fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(auth && { Authorization: auth }) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

  it("serves health without a token and rejects unauthorized requests", async () => {
    withToken();
    const base = await start();
    expect(await (await fetch(`${base}/health`)).json()).toEqual({ ok: true });
    expect((await fetch(`${base}/mcp/health`)).status).toBe(200);
    expect((await rpc(base)).status).toBe(401);
    expect((await rpc(base, "Bearer wrong")).status).toBe(401);
  });

  it("answers JSON-RPC with the right token", async () => {
    withToken();
    const base = await start();
    const response = await rpc(base, `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("list_pages");
  });

  it("reports internal failures as 500", async () => {
    db.settings.findFirst.mockRejectedValue(new Error("db down"));
    const base = await start();
    expect((await rpc(base, `Bearer ${TOKEN}`)).status).toBe(500);
  });
});
