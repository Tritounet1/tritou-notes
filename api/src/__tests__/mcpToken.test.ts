import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
import * as settings from "../controllers/settingsController";
import { generateMcpToken, hashMcpToken } from "../utils/mcpToken";

beforeEach(resetDatabase);

describe("MCP token", () => {
  it("generates distinct prefixed tokens and a stable SHA-256 hash", () => {
    const token = generateMcpToken();
    expect(token).toMatch(/^tritou_mcp_[\w-]{43}$/);
    expect(generateMcpToken()).not.toBe(token);
    expect(hashMcpToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("stores only the hash and returns the token once", async () => {
    db.settings.findFirstOrThrow.mockResolvedValue({ id: 1 });
    db.settings.update.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const ctx = await call(settings.createMcpToken);
    const { token } = ctx.json.mock.calls[0][0];
    const { data } = db.settings.update.mock.calls[0][0];
    expect(data.mcpTokenHash).toBe(hashMcpToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(ctx.status).toHaveBeenCalledWith(201);
  });

  it("revokes the token", async () => {
    db.settings.findFirstOrThrow.mockResolvedValue({ id: 1 });
    await call(settings.deleteMcpToken);
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { mcpTokenHash: null, mcpTokenCreatedAt: null } });
  });

  it("never sends the hash to the browser", async () => {
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpPort: 587, mcpTokenHash: "secret-hash" }]);
    const ctx = await call(settings.getSettings);
    expect(ctx.json).toHaveBeenCalledWith([{ id: 1, smtpPort: 587, mcpTokenSet: true }]);
  });
});
