import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
import * as settings from "../controllers/settingsController";
import * as tokens from "../controllers/mcpTokenController";
import { generateMcpToken, hashMcpToken } from "../utils/mcpToken";

beforeEach(resetDatabase);

describe("MCP token", () => {
  it("generates distinct prefixed tokens and a stable SHA-256 hash", () => {
    const token = generateMcpToken();
    expect(token).toMatch(/^tritou_mcp_[\w-]{43}$/);
    expect(generateMcpToken()).not.toBe(token);
    expect(hashMcpToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("lists the user's own tokens without their hash", async () => {
    db.mcpToken.findMany.mockResolvedValue([{ id: 1, name: "Portable", hash: "secret-hash", readOnly: true, created_at: new Date(0), last_used_at: null, userId: 7 }]);
    const ctx = await call(tokens.listMcpTokens);
    expect(db.mcpToken.findMany).toHaveBeenCalledWith({ where: { userId: 7 }, orderBy: { created_at: "desc" } });
    expect(ctx.json).toHaveBeenCalledWith([{ id: 1, name: "Portable", readOnly: true, created_at: new Date(0), last_used_at: null }]);
  });

  it("creates a named token, stores only its hash and returns it once", async () => {
    db.mcpToken.create.mockImplementation(async ({ data }) => ({ id: 2, created_at: new Date(0), last_used_at: null, ...data }));
    const ctx = await call(tokens.createMcpToken, { name: "  Claude Code  ", readOnly: true });
    const { token, ...shown } = ctx.json.mock.calls[0][0];
    const { data } = db.mcpToken.create.mock.calls[0][0];
    expect(data).toEqual({ name: "Claude Code", readOnly: true, hash: hashMcpToken(token), userId: 7 });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(shown).toEqual({ id: 2, name: "Claude Code", readOnly: true, created_at: new Date(0), last_used_at: null });
    expect(ctx.status).toHaveBeenCalledWith(201);
    // Read-only only when asked explicitly.
    await call(tokens.createMcpToken, { name: "Complet", readOnly: "yes" });
    expect(db.mcpToken.create.mock.calls[1][0].data.readOnly).toBe(false);
    expect((await call(tokens.createMcpToken, { name: "  " })).status).toHaveBeenCalledWith(400);
  });

  it("lets only the owner revoke a token", async () => {
    db.mcpToken.deleteMany.mockResolvedValue({ count: 1 });
    expect((await call(tokens.deleteMcpToken)).json).toHaveBeenCalledWith({ message: "Jeton révoqué." });
    expect(db.mcpToken.deleteMany).toHaveBeenCalledWith({ where: { id: 12, userId: 7 } });
    db.mcpToken.deleteMany.mockResolvedValue({ count: 0 });
    expect((await call(tokens.deleteMcpToken)).status).toHaveBeenCalledWith(404);
  });

  it("shows SMTP host and user decrypted, never the password", async () => {
    const { encrypt } = await import("../utils/utils");
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpHost: encrypt("smtp.example.com"), smtpUser: encrypt("mail@example.com"), smtpPassword: encrypt("secret") }]);
    const [shown] = (await call(settings.getSettings)).json.mock.calls[0][0];
    expect(shown).toEqual({ id: 1, smtpHost: "smtp.example.com", smtpUser: "mail@example.com", smtpPasswordSet: true, openrouterApiKeySet: false });
    // Unreadable values (ENCRYPTION_KEY changed) are shown as empty instead of failing.
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpHost: "not-encrypted" }]);
    expect((await call(settings.getSettings)).json.mock.calls[0][0][0].smtpHost).toBeNull();
  });

  it("never sends the OpenRouter key to the browser", async () => {
    db.settings.findMany.mockResolvedValue([{ id: 1, smtpPort: 587, openrouterApiKey: "encrypted-key" }]);
    const ctx = await call(settings.getSettings);
    expect(ctx.json).toHaveBeenCalledWith([{ id: 1, smtpPort: 587, smtpHost: null, smtpUser: null, openrouterApiKeySet: true, smtpPasswordSet: false }]);
  });
});
