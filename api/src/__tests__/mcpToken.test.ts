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
    // The MCP server acts as the admin who generated the token.
    expect(data.mcpTokenUserId).toBe(7);
    expect(JSON.stringify(data)).not.toContain(token);
    expect(ctx.status).toHaveBeenCalledWith(201);
  });

  it("revokes the token", async () => {
    db.settings.findFirstOrThrow.mockResolvedValue({ id: 1 });
    await call(settings.deleteMcpToken);
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { mcpTokenHash: null, mcpTokenCreatedAt: null, mcpTokenUserId: null } });
  });

  it("shows SMTP host and user decrypted, never the password", async () => {
    const { encrypt } = await import("../utils/utils");
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpHost: encrypt("smtp.example.com"), smtpUser: encrypt("mail@example.com"), smtpPassword: encrypt("secret"), mcpTokenHash: null }]);
    const [shown] = (await call(settings.getSettings)).json.mock.calls[0][0];
    expect(shown).toEqual({ id: 1, smtpHost: "smtp.example.com", smtpUser: "mail@example.com", smtpPasswordSet: true, mcpTokenSet: false, openrouterApiKeySet: false });
    // Unreadable values (ENCRYPTION_KEY changed) are shown as empty instead of failing.
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpHost: "not-encrypted", mcpTokenHash: null }]);
    expect((await call(settings.getSettings)).json.mock.calls[0][0][0].smtpHost).toBeNull();
  });

  it("never sends the hash to the browser", async () => {
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpPort: 587, mcpTokenHash: "secret-hash", openrouterApiKey: "encrypted-key" }]);
    const ctx = await call(settings.getSettings);
    expect(ctx.json).toHaveBeenCalledWith([{ id: 1, smtpPort: 587, smtpHost: null, smtpUser: null, mcpTokenSet: true, openrouterApiKeySet: true, smtpPasswordSet: false }]);
  });
});
