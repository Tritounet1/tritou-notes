import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
import { dispatch } from "./helpers/http";
vi.mock("../config/prismaClient", () => ({ prisma: db }));
const mocks = vi.hoisted(() => ({ hash: vi.fn(), token: vi.fn() }));
vi.mock("../utils/utils", () => ({ makeid: () => "bootstrap-code", encrypt: vi.fn() }));
vi.mock("../utils/bcryptUtils", () => ({ hashPassword: mocks.hash }));
vi.mock("../utils/jwtUtils", () => ({ createToken: mocks.token, decodeToken: vi.fn() }));
vi.mock("../config/mailClient", () => ({ sendEmail: vi.fn() }));
vi.mock("../config/queue", () => ({ scrapeQueue: {} }));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  resetDatabase();
  mocks.hash.mockResolvedValue("bootstrap-hash");
  mocks.token.mockReturnValue("jwt");
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

async function bootstrap() {
  const { default: router } = await import("../routes/authAdminRoutes");
  await Promise.resolve();
  return router;
}
describe("first administrator setup", () => {
  it("logs the bootstrap link, unless ADMIN_BOOTSTRAP_CODE keeps it secret", async () => {
    db.user.count.mockResolvedValue(0);
    await bootstrap();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("code=bootstrap-code"));

    vi.mocked(console.log).mockClear();
    vi.stubEnv("ADMIN_BOOTSTRAP_CODE", "c".repeat(32));
    try {
      vi.resetModules();
      const router = await bootstrap();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("code=<ADMIN_BOOTSTRAP_CODE>"));
      expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("c".repeat(32));
      const ctx = await dispatch(router, "POST", `/${"c".repeat(32)}`, { body: { email: user.email, username: "admin", password: "password-long" } });
      expect(ctx.status).toHaveBeenCalledWith(201);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("disables bootstrap registration if an administrator already exists", async () => {
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code");
    expect(ctx.json).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("creates a hashed administrator with all permissions and a secure cookie", async () => {
    db.user.count.mockResolvedValue(0);
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { email: user.email, username: user.username, password: "bootstrap-password" } });
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(db.user.create).toHaveBeenCalledWith({
      data: {
        email: user.email, username: user.username, password: "bootstrap-hash", role: "ADMIN",
        userPermissions: { create: { modifyScraper: true, useScraper: true, modifyScraperStatus: true, deleteScraper: true, createDocument: true, deleteDocument: true, modifyDocument: true, useAiChatBot: true, accessScrapersPage: true, accessInstancesScrapersPage: true } },
      },
      include: { userPermissions: true },
    });
    expect(ctx.json.mock.calls[0][0].user).not.toHaveProperty("password");
    expect(ctx.cookie).toHaveBeenCalledOnce();
  });
  it("rejects reuse of the bootstrap URL once an administrator exists", async () => {
    db.user.count.mockResolvedValueOnce(0).mockResolvedValue(1);
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { password: "password-long" } });
    expect(ctx.status).toHaveBeenCalledWith(409);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("forwards account creation errors", async () => {
    db.user.count.mockResolvedValue(0);
    db.user.create.mockRejectedValue(new Error("Database unavailable"));
    await expect(dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { email: user.email, username: "admin", password: "password" } })).rejects.toThrow("Database unavailable");
  });
  it("does not set a cookie if signing fails", async () => {
    db.user.count.mockResolvedValue(0);
    mocks.token.mockReturnValue(undefined);
    await expect(dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { email: user.email, username: "admin", password: "password" } })).rejects.toThrow("creation du token");
  });
  it.each([
    [{ email: "not-an-email", username: "admin", password: "password-long" }, "E-mail valide"],
    [{ email: "a@b.co", username: "  ", password: "password-long" }, "E-mail valide"],
    [{ email: "a@b.co", username: "admin", password: "short" }, "8 caractères"],
    [{ email: "a@b.co", username: "admin", password: "é".repeat(37) }, "72 octets"],
    [{}, "E-mail valide"],
  ])("refuses an invalid first administrator %j", async (body, message) => {
    db.user.count.mockResolvedValue(0);
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code", { body });
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(ctx.json).toHaveBeenCalledWith({ message: expect.stringContaining(message) });
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe("application composition", () => {
  it.each([true, false])("initializes settings only when absent (existing=%s)", async existing => {
    db.settings.findFirst.mockResolvedValue(existing ? { id: 4 } : null);
    const { default: app } = await import("../app");
    expect(app).toBeTypeOf("function");
    await vi.waitFor(() => expect(db.settings.findFirst).toHaveBeenCalledWith());
    if (existing) expect(db.settings.create).not.toHaveBeenCalled();
    else await vi.waitFor(() => expect(db.settings.create).toHaveBeenCalledWith({ data: {} }));
  });
  it("does not crash when the database is not reachable at startup", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.settings.findFirst.mockRejectedValue(new Error("ECONNREFUSED"));
    await import("../app");
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Could not initialise the settings:", expect.any(Error)));
  });
});
