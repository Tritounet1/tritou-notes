import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
import { call, context } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const decode = vi.hoisted(() => vi.fn());
vi.mock("../utils/jwtUtils", () => ({ decodeToken: decode }));
import { authHandler } from "../middlewares/authMiddleware";
import { adminMiddleware } from "../middlewares/adminMiddleware";
import { requirePermission } from "../middlewares/permissionsMiddleware";
import { errorHandler } from "../middlewares/errorHandler";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  decode.mockReturnValue({ id: "7", role: "ADMIN" });
});

describe("authentication", () => {
  it.each([{ cookies: { auth_token: "cookie" }, headers: { authorization: "Bearer header" }, token: "cookie" }, { cookies: {}, headers: { authorization: "Bearer header" }, token: "header" }])("authenticates $token and takes identity from the database", async ({ cookies, headers, token }) => {
    db.user.findUnique.mockResolvedValue({ ...user, role: "USER" });
    const ctx = await call(authHandler, {}, { user: undefined, cookies, headers });
    expect(decode).toHaveBeenCalledWith(token);
    expect(ctx.req.user).toEqual({ id: 7, email: user.email, username: user.username, role: "USER" });
    expect(ctx.next).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(["no token", "invalid token", "deleted user", "database failure"])("rejects %s", async failure => {
    if (failure === "invalid token") decode.mockImplementation(() => { throw new Error("bad signature"); });
    if (failure === "deleted user") db.user.findUnique.mockResolvedValue(null);
    if (failure === "database failure") db.user.findUnique.mockRejectedValue(new Error("offline"));
    const ctx = await call(authHandler, {}, { user: undefined, cookies: failure === "no token" ? {} : { auth_token: "token" } });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it.each([undefined, "string-token", {}, { id: "7suffix" }, { id: 7 }])("rejects malformed JWT identity %j", async payload => {
    decode.mockReturnValue(payload);
    const ctx = await call(authHandler, {}, { user: undefined, cookies: { auth_token: "token" } });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it.each([true, false])("allows public=%s documents accordingly", async isPublic => {
    db.document.findFirst.mockResolvedValue({ public: isPublic });
    const ctx = await call(authHandler, {}, { path: "/api/documents/12", user: undefined });
    if (isPublic) expect(ctx.next).toHaveBeenCalledOnce();
    else expect(ctx.status).toHaveBeenCalledWith(401);
  });
  it("still serves public documents with an invalid or stale session cookie", async () => {
    db.document.findFirst.mockResolvedValue({ public: true });
    decode.mockImplementation(() => { throw new Error("jwt expired"); });
    expect((await call(authHandler, {}, { path: "/api/documents/12", user: undefined, cookies: { auth_token: "old" } })).next).toHaveBeenCalledOnce();
    decode.mockReturnValue({ id: "7" });
    db.user.findUnique.mockResolvedValue(null);
    expect((await call(authHandler, {}, { path: "/api/documents/12", user: undefined, cookies: { auth_token: "deleted-user" } })).next).toHaveBeenCalledOnce();
  });
  it("answers 401 when the public-document lookup fails", async () => {
    db.document.findFirst.mockRejectedValue(new Error("offline"));
    expect((await call(authHandler, {}, { path: "/api/documents/12", user: undefined })).status).toHaveBeenCalledWith(401);
  });
  it("does not grant public-document access to other resources", async () => {
    db.document.findFirst.mockResolvedValue({ public: true });
    expect((await call(authHandler, {}, { path: "/api/document-histories/12", user: undefined })).status).toHaveBeenCalledWith(401);
    expect(db.document.findFirst).not.toHaveBeenCalled();
  });
});

describe("permissions", () => {
  it("lets admins bypass per-user permissions", async () => {
    expect((await call(requirePermission("modifyDocument"))).next).toHaveBeenCalledOnce();
    expect(db.userPermissions.findUnique).not.toHaveBeenCalled();
  });
  it("requires an authenticated identity", async () => {
    expect((await call(requirePermission("modifyDocument"), {}, { user: undefined })).status).toHaveBeenCalledWith(401);
  });
  it.each([null, {}, { modifyDocument: true, deleteDocument: false }, { modifyDocument: "true", deleteDocument: true }])("requires all explicit boolean grants: %j", async permission => {
    db.userPermissions.findUnique.mockResolvedValue(permission);
    const ctx = await call(requirePermission("modifyDocument", "deleteDocument"), {}, { user: { id: 7, role: "USER" } });
    expect(ctx.status).toHaveBeenCalledWith(403);
    expect(ctx.next).not.toHaveBeenCalled();
  });
  it("accepts the full required set", async () => {
    db.userPermissions.findUnique.mockResolvedValue({ modifyDocument: true, deleteDocument: true });
    expect((await call(requirePermission("modifyDocument", "deleteDocument"), {}, { user: { id: 7, role: "USER" } })).next).toHaveBeenCalledOnce();
  });
  it("fails closed when the permission store is down", async () => {
    db.userPermissions.findUnique.mockRejectedValue(new Error("offline"));
    expect((await call(requirePermission("modifyDocument"), {}, { user: { id: 7, role: "USER" } })).status).toHaveBeenCalledWith(500);
  });
  it.each([undefined, "USER", "ADMIN"])("checks administrative roles: %s", async role => {
    const ctx = await call(adminMiddleware(), {}, { user: role ? { id: 7, role } : undefined });
    if (role === "ADMIN") expect(ctx.next).toHaveBeenCalledOnce();
    else expect(ctx.status).toHaveBeenCalledWith(role ? 403 : 401);
  });
});

it.each([
  [{ status: 409, message: "Conflict" }, 409, "Conflict"],
  [{ status: 413 }, 413, "Erreur"],
  // Internal details (Prisma, bcrypt, crypto…) never reach the client.
  [new Error("connect ECONNREFUSED 10.0.0.3:5432"), 500, "Erreur interne du serveur."],
  [{}, 500, "Erreur interne du serveur."],
  ["boom", 500, "Erreur interne du serveur."],
  [{ code: "P2025", message: "No record was found for a delete." }, 404, "Élément introuvable."],
  [{ code: "P2002" }, 409, "Cet élément existe déjà."],
  [{ code: "P2003" }, 409, "Cet élément est encore utilisé ailleurs."],
  [{ name: "PrismaClientValidationError", message: "Argument `id`: Invalid value provided. Expected Int, provided NaN." }, 400, "Requête invalide."],
])("formats errors %j without leaking internals", (error, status, message) => {
  const ctx = context();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  errorHandler(error, ctx.req, ctx.res, ctx.next);
  expect(ctx.status).toHaveBeenCalledWith(status);
  expect(ctx.json).toHaveBeenCalledWith({ message });
  expect(log).toHaveBeenCalledTimes(status >= 500 ? 1 : 0);
  vi.restoreAllMocks();
});
