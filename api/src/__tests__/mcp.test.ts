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
import { authorize, buildServer, MCP_INSTRUCTIONS, READ_ONLY_TOOLS, stdioIdentity } from "../mcp/server";
import { hashMcpToken } from "../utils/mcpToken";

const TOKEN = "tritou_mcp_test";
const withToken = (overrides: Record<string, unknown> = {}) =>
  db.mcpToken.findUnique.mockImplementation(async ({ where: { hash } }) => (hash === hashMcpToken(TOKEN) ? { id: 3, userId: 7, readOnly: false, ...overrides } : null));

const connect = async (identity = { userId: 7, readOnly: false }) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await buildServer(identity).connect(serverTransport);
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
  it("returns the identity of a personal token and records its use", async () => {
    withToken({ readOnly: true });
    expect(await authorize(`Bearer ${TOKEN}`)).toEqual({ userId: 7, readOnly: true });
    expect(db.mcpToken.findUnique).toHaveBeenCalledWith({ where: { hash: hashMcpToken(TOKEN) } });
    expect(db.mcpToken.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { last_used_at: expect.any(Date) } });
  });

  it("fails closed", async () => {
    withToken();
    expect(await authorize(undefined)).toBeNull();
    expect(await authorize("Basic abc")).toBeNull();
    expect(await authorize("Bearer ")).toBeNull();
    expect(await authorize("Bearer revoked-or-unknown")).toBeNull();
  });

  it("reads the stdio token from MCP_TOKEN", async () => {
    withToken();
    vi.stubEnv("MCP_TOKEN", TOKEN);
    expect(await stdioIdentity()).toEqual({ userId: 7, readOnly: false });
    vi.stubEnv("MCP_TOKEN", "");
    expect(await stdioIdentity()).toBeNull();
    vi.unstubAllEnvs();
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

  it("gives a read-only token only the tools that read", async () => {
    const client = await connect({ userId: 7, readOnly: true });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(new Set(names)).toEqual(READ_ONLY_TOOLS);
    const refused = await client.callTool({ name: "delete_page", arguments: { id: 1 } });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("lecture seule");
    expect(db.document.delete).not.toHaveBeenCalled();
    db.document.findMany.mockResolvedValue([]);
    expect((await client.callTool({ name: "list_pages", arguments: {} })).isError).toBe(false);
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
    db.mcpToken.findUnique.mockRejectedValue(new Error("db down"));
    const base = await start();
    expect((await rpc(base, `Bearer ${TOKEN}`)).status).toBe(500);
  });
});
