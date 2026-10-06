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
  it("disables bootstrap registration if an administrator already exists", async () => {
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code");
    expect(ctx.json).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("creates a hashed administrator with all permissions and a secure cookie", async () => {
    db.user.count.mockResolvedValue(0);
    const ctx = await dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { email: user.email, username: user.username, password: "bootstrap-password" } });
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: user.email, username: user.username, password: "bootstrap-hash", role: "ADMIN" } });
    expect(db.userPermissions.create).toHaveBeenCalledWith({ data: { userId: 7, modifyScraper: true, useScraper: true, modifyScraperStatus: true, deleteScraper: true, createDocument: true, deleteDocument: true, modifyDocument: true, useAiChatBot: true, accessScrapersPage: true, accessInstancesScrapersPage: true } });
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
    await expect(dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { password: "password" } })).rejects.toThrow("Database unavailable");
  });
  it("does not set a cookie if signing fails", async () => {
    db.user.count.mockResolvedValue(0);
    mocks.token.mockReturnValue(undefined);
    await expect(dispatch(await bootstrap(), "POST", "/bootstrap-code", { body: { password: "password" } })).rejects.toThrow("creation du token");
  });
});

describe("application composition", () => {
  it.each([true, false])("initializes settings only when absent (existing=%s)", async existing => {
    if (!existing) db.settings.findFirstOrThrow.mockRejectedValue(new Error("Not found"));
    const { default: app } = await import("../app");
    await Promise.resolve();
    expect(app).toBeTypeOf("function");
    expect(db.settings.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 1 } });
    if (existing) expect(db.settings.create).not.toHaveBeenCalled();
    else expect(db.settings.create).toHaveBeenCalledWith({ data: {} });
  });
});
