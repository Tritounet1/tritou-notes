vi.mock("../utils/documentImageStorage", async importOriginal => ({
  ...await importOriginal<typeof import("../utils/documentImageStorage")>(),
  removeDocumentImages: async () => {},
}));
import type { Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
import { dispatch } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ decode: vi.fn(), mail: vi.fn(), preview: vi.fn(), parse: vi.fn() }));
vi.mock("../utils/jwtUtils", () => ({ decodeToken: mocks.decode, createToken: () => "jwt" }));
vi.mock("../config/mailClient", () => ({ sendEmail: mocks.mail }));
vi.mock("../config/queue", () => ({ scrapeQueue: { add: vi.fn(), getRepeatableJobs: async () => [] } }));
vi.mock("../utils/utils", () => ({ encrypt: (value: string) => value, makeid: () => "token" }));
vi.mock("../utils/linkPreview", () => ({ getLinkPreview: mocks.preview, parsePublicUrl: mocks.parse }));
import documents from "../routes/documentRoutes";
import scrapers from "../routes/scraperRoutes";
import instances from "../routes/instanceScrapeRoutes";
import schedulers from "../routes/scrapingSchedulerRoutes";
import ai from "../routes/aiRoutes";
import folders from "../routes/folderRoutes";
import users from "../routes/userRoutes";
import permissions from "../routes/userPermissionsRoutes";
import settings from "../routes/settingsRoutes";
import invitations from "../routes/authAdminRoutes";
import preview from "../routes/linkPreviewRoutes";
import histories from "../routes/documentHistoryRoutes";
import instanceHistories from "../routes/instanceScrapeHistoryRoutes";

const regular = { id: 7, role: "USER" };
beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  mocks.decode.mockReturnValue({ id: "7" });
  mocks.preview.mockResolvedValue({ title: "Example", url: "https://example.com" });
});

type ProtectedRoute = { area: string; router: Router; method: string; url: string; permission: string };
const protectedRoutes: ProtectedRoute[] = [
  ...[["POST", "/", "createDocument"], ["PUT", "/12", "modifyDocument"], ["DELETE", "/12", "deleteDocument"]].map(([method, url, permission]) => ({ area: "documents", router: documents, method, url, permission })),
  ...[["POST", "/", "createDocument"], ["PATCH", "/12", "modifyDocument"], ["DELETE", "/12", "deleteDocument"]].map(([method, url, permission]) => ({ area: "folders", router: folders, method, url, permission })),
  ...[["GET", "/", "accessScrapersPage"], ["GET", "/12", "accessScrapersPage"], ["POST", "/", "modifyScraper"], ["PUT", "/12", "modifyScraper"], ["DELETE", "/12", "deleteScraper"]].map(([method, url, permission]) => ({ area: "scrapers", router: scrapers, method, url, permission })),
  ...[["GET", "/", "accessInstancesScrapersPage"], ["GET", "/12", "accessInstancesScrapersPage"], ["POST", "/", "useScraper"], ["DELETE", "/12", "useScraper"]].map(([method, url, permission]) => ({ area: "instances", router: instances, method, url, permission })),
  ...[["GET", "/", "accessScrapersPage"], ["GET", "/12", "accessScrapersPage"], ["GET", "/12/preview", "accessScrapersPage"], ["POST", "/", "modifyScraperStatus"], ["PUT", "/12", "modifyScraperStatus"], ["DELETE", "/12", "modifyScraperStatus"]].map(([method, url, permission]) => ({ area: "schedulers", router: schedulers, method, url, permission })),
  ...[["GET", "/status"], ["GET", "/conversations"], ["POST", "/conversations"], ["GET", "/conversations/12"], ["PATCH", "/conversations/12"], ["DELETE", "/conversations/12"]]
    .map(([method, url]) => ({ area: "AI", router: ai, method, url, permission: "useAiChatBot" })),
  { area: "link preview", router: preview, method: "GET", url: "/", permission: "modifyDocument" },
];

// Gated routes whose success path needs a configured OpenRouter key (covered in ai.test.ts).
const blockOnlyRoutes: ProtectedRoute[] = [
  { area: "AI", router: ai, method: "POST", url: "/conversations/12/messages", permission: "useAiChatBot" },
  { area: "AI", router: ai, method: "POST", url: "/images", permission: "useAiChatBot" },
];

describe("route permission matrix", () => {
  it.each([...protectedRoutes, ...blockOnlyRoutes])("blocks $area $method $url without $permission", async route => {
    db.userPermissions.findUnique.mockResolvedValue({});
    const ctx = await dispatch(route.router, route.method, route.url, { user: regular });
    expect(ctx.status).toHaveBeenCalledWith(403);
    expect(db.userPermissions.findUnique).toHaveBeenCalledWith({ where: { userId: 7 } });
    for (const [name, model] of Object.entries(db)) {
      for (const [method, mock] of Object.entries(model)) {
        if (name === "userPermissions" && method === "findUnique") continue;
        expect(mock, `${name}.${method} must not run`).not.toHaveBeenCalled();
      }
    }
  });
  it.each(protectedRoutes)("permits $area $method $url with $permission", async route => {
    db.userPermissions.findUnique.mockResolvedValue({ [route.permission]: true });
    db.scrapingScheduler.findUnique.mockResolvedValue({ id: 12, InstanceScrapes: [] });
    const ctx = await dispatch(route.router, route.method, route.url, { user: regular, query: { url: "https://example.com" }, body: { title: "Note", name: "Scraper", url: "https://example.com" } });
    expect(ctx.status).not.toHaveBeenCalledWith(403);
    expect(ctx.json).toHaveBeenCalledOnce();
  });
});

const administrative = [
  ...[["GET", "/"], ["GET", "/12"], ["POST", "/"], ["PUT", "/12"], ["DELETE", "/12"]].map(([method, url]) => ({ area: "users", router: users, method, url })),
  ...[["GET", "/12"], ["PUT", "/12"]].map(([method, url]) => ({ area: "permissions", router: permissions, method, url })),
  ...[["GET", "/"], ["PUT", "/12"]].map(([method, url]) => ({ area: "settings", router: settings, method, url })),
];
it.each(administrative)("blocks non-admin $area $method $url", async route => {
  const ctx = await dispatch(route.router, route.method, route.url, { user: regular });
  expect(ctx.status).toHaveBeenCalledWith(403);
  for (const model of Object.values(db)) for (const mock of Object.values(model)) expect(mock).not.toHaveBeenCalled();
});
it.each(administrative)("allows admin $area $method $url", async route => {
  const ctx = await dispatch(route.router, route.method, route.url, { body: { password: "password-long" } });
  expect(ctx.status).not.toHaveBeenCalledWith(403);
  expect(ctx.json).toHaveBeenCalledOnce();
});

it("rejects invitations from an authenticated regular user", async () => {
  db.user.findUnique.mockResolvedValue({ ...user, role: "USER" });
  const ctx = await dispatch(invitations, "POST", "/invite", { cookies: { auth_token: "valid" }, body: { email: "new@example.com" } });
  expect(ctx.status).toHaveBeenCalledWith(403);
  expect(mocks.mail).not.toHaveBeenCalled();
  expect(db.invitation.create).not.toHaveBeenCalled();
});
it("allows an administrator to send an invitation", async () => {
  db.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
  const ctx = await dispatch(invitations, "POST", "/invite", { cookies: { auth_token: "valid" }, body: { email: "new@example.com" } });
  expect(ctx.status).toHaveBeenCalledWith(201);
  expect(mocks.mail).toHaveBeenCalledOnce();
});
it("rejects unauthenticated invitation senders", async () => {
  const ctx = await dispatch(invitations, "POST", "/invite", { user: undefined });
  expect(ctx.status).toHaveBeenCalledWith(401);
  expect(mocks.mail).not.toHaveBeenCalled();
});
it.each(["GET", "POST"])("keeps invitation %s validation public", async method => {
  db.invitation.findUnique.mockResolvedValue(null);
  expect((await dispatch(invitations, method, "/invitation/token", { user: undefined, body: { username: "new", password: "password-long" } })).status).toHaveBeenCalledWith(404);
});
// The workspace is shared: every signed-in user reads the pages and their history.
it.each([{ router: documents, url: "/" }, { router: documents, url: "/12" }, { router: histories, url: "/12" }])("serves shared read routes to any signed-in user %#", async ({ router, url }) => {
  const ctx = await dispatch(router, "GET", url, { user: regular });
  expect(ctx.status).not.toHaveBeenCalled();
  expect(ctx.json).toHaveBeenCalledOnce();
});
// Scrape results follow the scraping pages' permissions.
it.each(["/", "/12"])("serves scrape results %s only with a scraping page permission", async url => {
  db.userPermissions.findUnique.mockResolvedValue({ accessInstancesScrapersPage: false, accessScrapersPage: false });
  expect((await dispatch(instanceHistories, "GET", url, { user: regular })).status).toHaveBeenCalledWith(403);
  for (const permission of ["accessInstancesScrapersPage", "accessScrapersPage"]) {
    db.userPermissions.findUnique.mockResolvedValue({ [permission]: true });
    const ctx = await dispatch(instanceHistories, "GET", url, { user: regular });
    expect(ctx.status).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledOnce();
  }
});

describe("link preview endpoint", () => {
  it.each([undefined, ["https://example.com"], 12])("rejects missing or ambiguous URLs %j", async url => {
    expect((await dispatch(preview, "GET", "/", { query: { url } })).status).toHaveBeenCalledWith(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("rejects unsafe URLs before fetching", async () => {
    mocks.parse.mockImplementation(() => { throw new Error("private host"); });
    expect((await dispatch(preview, "GET", "/", { query: { url: "http://127.0.0.1" } })).status).toHaveBeenCalledWith(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("returns 422 when the remote page is unavailable", async () => {
    mocks.preview.mockRejectedValue(new Error("timeout"));
    expect((await dispatch(preview, "GET", "/", { query: { url: "https://example.com" } })).status).toHaveBeenCalledWith(422);
  });
});
