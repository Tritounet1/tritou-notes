import type { NextFunction, Request, Response, Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(), updateUser: vi.fn(), verifyPassword: vi.fn(), hashPassword: vi.fn(), decodeToken: vi.fn(),
  getSettings: vi.fn(), updateSettings: vi.fn(), createMcpToken: vi.fn(), deleteMcpToken: vi.fn(),
}));
vi.mock("../config/prismaClient", () => ({ prisma: { user: { findUnique: mocks.findUser, update: mocks.updateUser } } }));
vi.mock("../utils/bcryptUtils", () => ({ verifyPassword: mocks.verifyPassword, hashPassword: mocks.hashPassword }));
vi.mock("../utils/jwtUtils", () => ({ decodeToken: mocks.decodeToken, createToken: vi.fn() }));
vi.mock("../controllers/settingsController", () => ({ getSettings: mocks.getSettings, updateSettings: mocks.updateSettings, createMcpToken: mocks.createMcpToken, deleteMcpToken: mocks.deleteMcpToken }));
import authRoutes from "../routes/authRoutes";
import settingsRoutes from "../routes/settingsRoutes";

const user = { id: 7, username: "Utilisateur", email: "user@example.com", role: "USER", password: "old-hash" };

async function dispatch(router: Router, method: string, url: string, body?: unknown, identity?: typeof user, authenticated = true) {
  const req = { method, url, path: url, headers: {}, cookies: authenticated ? { auth_token: "valid-token" } : {}, body, user: identity } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  const status = res.status as ReturnType<typeof vi.fn>;
  const json = res.json as ReturnType<typeof vi.fn>;
  status.mockReturnValue(res);
  await new Promise<void>((resolve, reject) => {
    json.mockImplementation(() => { resolve(); return res; });
    const next: NextFunction = error => error ? reject(error) : resolve();
    router(req, res, next);
  });
  return { status, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUser.mockResolvedValue(user);
  mocks.updateUser.mockResolvedValue(user);
  mocks.decodeToken.mockReturnValue({ id: "7" });
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.hashPassword.mockResolvedValue("new-hash");
  mocks.getSettings.mockImplementation((_req, res) => res.json([]));
  mocks.updateSettings.mockImplementation((_req, res) => res.json({}));
});

describe("personal password changes", () => {
  it("lets a regular user update only the authenticated account, ignoring a supplied target or role", async () => {
    const response = await dispatch(authRoutes, "POST", "/change-password", { currentPassword: "old-password", newPassword: "new-password", userId: 1, id: 1, role: "ADMIN" });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(mocks.verifyPassword).toHaveBeenCalledWith("old-password", "old-hash");
    expect(mocks.hashPassword).toHaveBeenCalledWith("new-password");
    // The new token version signs out the other sessions; this one gets a fresh cookie.
    expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({ where: { id: 7 }, data: { password: "new-hash", tokenVersion: { increment: 1 } } });
    expect(response.json).toHaveBeenCalledWith({ message: "Mot de passe mis a jour" });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await dispatch(authRoutes, "POST", "/change-password", { currentPassword: "old-password", newPassword: "new-password" }, undefined, false);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("requires the current password before hashing or updating", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const response = await dispatch(authRoutes, "POST", "/change-password", { currentPassword: "incorrect", newPassword: "new-password" });
    expect(response.status).toHaveBeenCalledWith(401);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    undefined, {}, { currentPassword: 123, newPassword: "new-password" },
    { currentPassword: "old-password", newPassword: ["new-password"] },
    { currentPassword: "old-password", newPassword: "short" },
    { currentPassword: "old-password", newPassword: "x".repeat(73) },
    { currentPassword: "old-password", newPassword: "é".repeat(37) },
  ])("rejects invalid or unsafe password input %#", async body => {
    const response = await dispatch(authRoutes, "POST", "/change-password", body);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects expired or tampered tokens", async () => {
    mocks.decodeToken.mockImplementationOnce(() => { throw new Error("Invalid token"); });
    const response = await dispatch(authRoutes, "POST", "/change-password", { currentPassword: "old-password", newPassword: "new-password" });
    expect(response.status).toHaveBeenCalledWith(401);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("administrative configuration stays private", () => {
  it.each(["GET", "PUT"])("denies a regular user direct %s access to global settings", async method => {
    const response = await dispatch(settingsRoutes, method, method === "GET" ? "/" : "/1", { smtpPassword: "changed" }, user);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.getSettings).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it.each(["POST", "DELETE"])("denies a regular user %s on the MCP token", async method => {
    const response = await dispatch(settingsRoutes, method, "/mcp-token", {}, user);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.createMcpToken).not.toHaveBeenCalled();
    expect(mocks.deleteMcpToken).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT"])("preserves administrator %s access", async method => {
    const response = await dispatch(settingsRoutes, method, method === "GET" ? "/" : "/1", {}, { ...user, role: "ADMIN" });
    expect(response.status).not.toHaveBeenCalled();
    expect(method === "GET" ? mocks.getSettings : mocks.updateSettings).toHaveBeenCalledOnce();
  });
});
