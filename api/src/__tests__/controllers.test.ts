import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
import { call } from "./helpers/http";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ hash: vi.fn(), verify: vi.fn(), token: vi.fn(), email: vi.fn(), encrypt: vi.fn(), response: vi.fn(), models: vi.fn(), upload: vi.fn(), add: vi.fn(), jobs: vi.fn(), remove: vi.fn() }));
vi.mock("../utils/bcryptUtils", () => ({ hashPassword: mocks.hash, verifyPassword: mocks.verify }));
vi.mock("../utils/jwtUtils", () => ({ createToken: mocks.token }));
vi.mock("../config/mailClient", () => ({ sendEmail: mocks.email }));
vi.mock("../utils/utils", () => ({ encrypt: mocks.encrypt, makeid: () => "safe-token" }));
vi.mock("../config/anthropicClient", () => ({ getResponse: mocks.response, getAnthropicModels: mocks.models }));
vi.mock("../utils/storageService", () => ({ uploadFile: mocks.upload }));
vi.mock("../config/queue", () => ({ scrapeQueue: { add: mocks.add, getRepeatableJobs: mocks.jobs, removeRepeatableByKey: mocks.remove } }));
import * as users from "../controllers/userController";
import * as auth from "../controllers/authController";
import * as invitations from "../controllers/adminAuthController";
import * as documents from "../controllers/documentController";
import * as documentHistory from "../controllers/documentHistoryController";
import * as conversation from "../controllers/conversationController";
import * as scrapers from "../controllers/scraperController";
import * as instances from "../controllers/instanceScrapeController";
import * as instanceHistory from "../controllers/instanceScrapeHistoryController";
import * as schedulers from "../controllers/scrapingSchedulerController";
import * as settings from "../controllers/settingsController";
import * as permissions from "../controllers/userPermissionsController";
import * as images from "../controllers/imagesController";
import * as ai from "../controllers/anthropicClientController";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  mocks.hash.mockResolvedValue("new-hash");
  mocks.verify.mockResolvedValue(true);
  mocks.token.mockReturnValue("jwt");
  mocks.encrypt.mockImplementation(value => `encrypted:${value}`);
  mocks.response.mockResolvedValue([{ type: "text", text: "Answer" }]);
  mocks.models.mockResolvedValue([{ id: "model" }]);
  mocks.jobs.mockResolvedValue([]);
  db.invitation.findUnique.mockResolvedValue({ email: "invited@example.com", used: false, expires_at: new Date(Date.now() + 10000) });
});

describe("user credentials", () => {
  it("hashes a new password and never returns credentials", async () => {
    const ctx = await call(users.createUser, { email: user.email, username: user.username, password: "password-long", role: "ADMIN" });
    expect(mocks.hash).toHaveBeenCalledWith("password-long");
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: user.email, username: user.username, password: "new-hash" } });
    expect(db.userPermissions.create).toHaveBeenCalledOnce();
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(ctx.json.mock.calls[0][0]).not.toHaveProperty("password");
  });
  it.each([undefined, null, 12, "", "short", "x".repeat(73), "é".repeat(37)])("rejects unsafe new passwords: %s", async password => {
    const ctx = await call(users.createUser, { password });
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it.each([undefined, ""])("preserves the existing password for profile-only updates: %s", async password => {
    const ctx = await call(users.updateUser, { username: "renamed", password });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { username: "renamed", email: undefined, password: undefined } });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(ctx.json.mock.calls[0][0]).not.toHaveProperty("password");
  });
  it("hashes administrator password resets", async () => {
    await call(users.updateUser, { password: "reset-password" });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ password: "new-hash" }) }));
  });
  it.each([null, [], "short", "é".repeat(37)])("rejects unsafe administrator resets: %s", async password => {
    const ctx = await call(users.updateUser, { password });
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it.each([users.getUserById, users.deleteUser])("omits password in single-user responses ($name)", async handler => {
    const ctx = await call(handler);
    expect(ctx.json.mock.calls[0][0]).not.toHaveProperty("password");
  });
  it("omits passwords in user listings", async () => {
    db.user.findMany.mockResolvedValue([user]);
    const ctx = await call(users.getUsers);
    expect(ctx.json.mock.calls[0][0][0]).not.toHaveProperty("password");
  });
});

describe("login and session", () => {
  it.each([["", "username"], ["user@example.com", "email"]])("authenticates by %s with a protected cookie", async (email, field) => {
    const ctx = await call(auth.login, { email, username: "user", password: "password" });
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { [field]: field === "email" ? email : "user" } });
    expect(ctx.cookie).toHaveBeenCalledWith("auth_token", "jwt", expect.objectContaining({ httpOnly: true, path: "/" }));
    expect(ctx.json.mock.calls[0][0].user).not.toHaveProperty("password");
  });
  it.each(["missing account", "wrong password"])("rejects %s without issuing a session", async reason => {
    if (reason === "missing account") db.user.findFirst.mockResolvedValue(null);
    else mocks.verify.mockResolvedValue(false);
    const ctx = await call(auth.login, { email: user.email, password: "wrong" });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(ctx.cookie).not.toHaveBeenCalled();
  });
  it("forwards token-generation failures without a cookie", async () => {
    mocks.token.mockReturnValue(undefined);
    const ctx = await call(auth.login, { email: user.email, password: "password" });
    expect(ctx.next).toHaveBeenCalledWith(expect.any(Error));
    expect(ctx.cookie).not.toHaveBeenCalled();
  });
  it("clears the authentication cookie on logout", async () => {
    const ctx = await call(auth.logout);
    expect(ctx.cookie).toHaveBeenCalledWith("auth_token", "", expect.objectContaining({ maxAge: 0, httpOnly: true }));
  });
  it("requires authentication for me", async () => {
    expect((await call(auth.me, {}, { user: undefined })).status).toHaveBeenCalledWith(401);
  });
  it("returns the current user and permissions", async () => {
    const ctx = await call(auth.me);
    expect(db.userPermissions.findFirst).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(ctx.json.mock.calls[0][0].user.id).toBe(7);
  });
  it("requires a session for direct password changes", async () => {
    const ctx = await call(auth.changePassword, {}, { user: undefined });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("rejects password changes when the account was deleted", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const ctx = await call(auth.changePassword, { currentPassword: "old-password", newPassword: "new-password" });
    expect(ctx.status).toHaveBeenCalledWith(404);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("invitations", () => {
  it("requires an email", async () => {
    expect((await call(invitations.sendInvitation)).status).toHaveBeenCalledWith(400);
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("rejects an email already registered", async () => {
    expect((await call(invitations.sendInvitation, { email: user.email })).status).toHaveBeenCalledWith(400);
    expect(db.invitation.create).not.toHaveBeenCalled();
  });
  it("replaces previous invitations and sends an expiring link", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const ctx = await call(invitations.sendInvitation, { email: "new@example.com" });
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(db.invitation.deleteMany).toHaveBeenCalledWith({ where: { email: "new@example.com" } });
    const data = db.invitation.create.mock.calls[0][0].data;
    expect(data.token).toBe("safe-token");
    expect(data.expires_at.getTime() - Date.now()).toBeGreaterThan(6 * 86400000);
    expect(mocks.email).toHaveBeenCalledWith("new@example.com", expect.any(String), expect.stringContaining("register?token=safe-token"));
  });
  for (const handler of [invitations.verifyInvitation, invitations.registerWithInvitation]) {
    it.each([["missing", null, 404], ["used", { used: true }, 400], ["expired", { used: false, expires_at: new Date(0) }, 400]])(`${handler.name} rejects %s invitations`, async (_label, invitation, status) => {
      db.invitation.findUnique.mockResolvedValue(invitation);
      const ctx = await call(handler, { username: "new", password: "password-long" });
      expect(ctx.status).toHaveBeenCalledWith(status);
      expect(db.user.create).not.toHaveBeenCalled();
    });
  }
  it("reveals only the email of a valid invitation", async () => {
    const ctx = await call(invitations.verifyInvitation);
    expect(ctx.json).toHaveBeenCalledWith({ email: "invited@example.com" });
  });
  it("rejects registration if the email became occupied", async () => {
    expect((await call(invitations.registerWithInvitation, { username: "new", password: "password-long" })).status).toHaveBeenCalledWith(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("registers a regular account with document permissions and consumes the invitation", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const ctx = await call(invitations.registerWithInvitation, { username: "new", password: "password-long", role: "ADMIN", email: "attacker@example.com" });
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: "invited@example.com", username: "new", password: "new-hash", role: "USER" } });
    expect(db.userPermissions.create).toHaveBeenCalledWith({ data: { userId: 7, createDocument: true, modifyDocument: true, deleteDocument: true } });
    expect(db.invitation.update).toHaveBeenCalledWith({ where: { token: "invitation" }, data: { used: true } });
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(ctx.json.mock.calls[0][0].user).not.toHaveProperty("password");
  });
  it("does not issue a cookie if JWT generation fails", async () => {
    db.user.findUnique.mockResolvedValue(null);
    mocks.token.mockReturnValue(undefined);
    const ctx = await call(invitations.registerWithInvitation, { username: "new", password: "password-long" });
    expect(ctx.next).toHaveBeenCalledWith(expect.any(Error));
    expect(ctx.cookie).not.toHaveBeenCalled();
  });
});

// Shared read contracts: missing resources are 404; collections remain arrays.
const reads = [
  [users.getUserById, db.user], [documents.getDocumentById, db.document],
  [scrapers.getScraperById, db.scraper], [instances.getInstancesScrapeById, db.instanceScrape],
  [schedulers.getScrapingSchedulerById, db.scrapingScheduler], [images.getImageById, db.images],
] as const;
it.each(reads.map(([handler, model]) => ({ handler, model, name: handler.name })))("$name returns 404 for a missing resource", async ({ handler, model }) => {
  model.findUnique.mockResolvedValue(null);
  expect((await call(handler)).status).toHaveBeenCalledWith(404);
});
it.each(reads.map(([handler, model]) => ({ handler, model, name: handler.name })))("$name returns the requested resource", async ({ handler, model }) => {
  const ctx = await call(handler);
  expect(model.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12 } }));
  expect(ctx.json).toHaveBeenCalledOnce();
});
const lists = [
  [documents.getDocuments, db.document], [documentHistory.getDocumentsHistories, db.documentHistory],
  [conversation.getConversations, db.conversation], [scrapers.getScrapers, db.scraper],
  [instances.getInstancesScrape, db.instanceScrape], [instanceHistory.getInstancesScrapeHistory, db.instanceScrapeHistory],
  [schedulers.getScrapingScheduler, db.scrapingScheduler], [settings.getSettings, db.settings], [images.getImages, db.images],
] as const;
it.each(lists.map(([handler, model]) => ({ handler, model, name: handler.name })))("$name returns an empty collection", async ({ handler, model }) => {
  const ctx = await call(handler);
  expect(model.findMany).toHaveBeenCalledOnce();
  expect(ctx.json).toHaveBeenCalledWith([]);
});
const histories = [
  [documentHistory.getDocumentHistoriesByDocumentId, db.documentHistory, "documentId"],
  [conversation.getConversationsByDocumentId, db.conversation, "documentId"],
  [instanceHistory.getInstancesScrapeHistoryByInstanceScrapeId, db.instanceScrapeHistory, "instanceScrapeId"],
] as const;
it.each(histories.map(([handler, model, key]) => ({ handler, model, key, name: handler.name })))("$name filters histories by their parent", async ({ handler, model, key }) => {
  const ctx = await call(handler);
  expect(model.findMany).toHaveBeenCalledWith({ where: { [key]: 12 } });
  expect(ctx.json).toHaveBeenCalledWith([]);
});

describe("document lifecycle", () => {
  it("uses the authenticated author when creating a document", async () => {
    const ctx = await call(documents.createDocument, { title: "Note", type: "TEXT", authorId: 99 });
    expect(db.document.create).toHaveBeenCalledWith({ data: { title: "Note", type: "TEXT", author: { connect: { id: 7 } } } });
    expect(ctx.status).toHaveBeenCalledWith(201);
  });
  it.each([documents.createDocument, documents.updateDocument])("%s rejects missing authors", async handler => {
    db.user.findFirst.mockResolvedValue(null);
    expect((await call(handler)).next).toHaveBeenCalledWith(expect.any(Error));
    expect(db.document.create).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
  });
  it("saves the previous contents before updating the document", async () => {
    db.document.findFirst.mockResolvedValue({ id: 12, title: "Old", text: "Before", public: false });
    await call(documents.updateDocument, { title: "New", text: "After", is_public: true });
    expect(db.documentHistory.create).toHaveBeenCalledWith({ data: { title: "Old", text: "Before", public: false, document: { connect: { id: 12 } }, author: { connect: { id: 7 } } } });
    expect(db.document.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { title: "New", text: "After", public: true, author: { connect: { id: 7 } }, last_update: expect.any(Date) } });
    expect(db.documentHistory.create.mock.invocationCallOrder[0]).toBeLessThan(db.document.update.mock.invocationCallOrder[0]);
  });
  it("does not update a missing document", async () => {
    db.document.findFirst.mockResolvedValue(null);
    expect((await call(documents.updateDocument)).next).toHaveBeenCalledWith(expect.any(Error));
    expect(db.documentHistory.create).not.toHaveBeenCalled();
  });
  it("deletes histories before deleting their parent document", async () => {
    await call(documents.deleteDocument);
    expect(db.documentHistory.deleteMany).toHaveBeenCalledWith({ where: { documentId: 12 } });
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(db.documentHistory.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(db.document.delete.mock.invocationCallOrder[0]);
  });
});

describe("scraping resources", () => {
  it("creates a scraper", async () => {
    expect((await call(scrapers.createScraper, { name: "Shop", description: "Prices" })).status).toHaveBeenCalledWith(201);
    expect(db.scraper.create).toHaveBeenCalledWith({ data: { name: "Shop", description: "Prices" } });
  });
  it("updates scraping code and its display template", async () => {
    await call(scrapers.updateScraper, { code: "result = {}", display_template: { title: "price" } });
    expect(db.scraper.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "result = {}", display_template: { title: "price" }, last_update: expect.any(Date) }) }));
  });
  it("rejects updating a missing scraper", async () => {
    db.scraper.findFirst.mockResolvedValue(null);
    expect((await call(scrapers.updateScraper)).next).toHaveBeenCalledWith(expect.any(Error));
  });
  it("queues an immediate scrape", async () => {
    expect((await call(instances.createInstanceScrape, { url: "https://example.com" })).status).toHaveBeenCalledWith(201);
    expect(mocks.add).toHaveBeenCalledWith("scrape-url", { id: 12 });
  });
  it("associates a scheduled scrape without queuing it immediately", async () => {
    await call(instances.createInstanceScrape, { url: "https://example.com", scrapingSchedulerId: "3", scraperId: "4" });
    expect(db.instanceScrape.create).toHaveBeenCalledWith({ data: { url: "https://example.com", scrapingSchedulerId: 3, scraperId: 4 } });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("forwards queue failures", async () => {
    mocks.add.mockRejectedValue(new Error("Redis unavailable"));
    expect((await call(instances.createInstanceScrape, { url: "https://example.com" })).next).toHaveBeenCalledWith(expect.objectContaining({ message: "Redis unavailable" }));
  });
  it("creates a scheduler for an existing user", async () => {
    expect((await call(schedulers.createScrapingScheduler, { title: "Daily", description: "Prices" })).status).toHaveBeenCalledWith(201);
  });
  it.each([schedulers.createScrapingScheduler, schedulers.updateScrapingScheduler])("%s rejects a missing user", async handler => {
    db.user.findFirst.mockResolvedValue(null);
    expect((await call(handler)).next).toHaveBeenCalledWith(expect.any(Error));
  });
  it("rejects updating a missing scheduler", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue(null);
    expect((await call(schedulers.updateScrapingScheduler)).next).toHaveBeenCalledWith(expect.any(Error));
  });
  it("activates recurring jobs and computes their next execution", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "INACTIVE" });
    db.scrapingScheduler.update.mockResolvedValue({ id: 12, status: "ACTIVATE", cron_expression: "0 * * * *" });
    await call(schedulers.updateScrapingScheduler, { status: "ACTIVATE", cron_expression: "0 * * * *" });
    expect(mocks.add).toHaveBeenCalledWith("scheduler-12", { schedulerId: 12 }, { repeat: { pattern: "0 * * * *" }, jobId: "scheduler-12" });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { start_at: expect.any(Date), next_run_at: expect.any(Date) } });
  });
  it.each([[[]], [[{ name: "scheduler-12", key: "repeat-key" }]]])("deactivates a scheduler with repeatable jobs %j", async jobs => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "ACTIVATE" });
    db.scrapingScheduler.update.mockResolvedValue({ status: "INACTIVE" });
    mocks.jobs.mockResolvedValue(jobs);
    await call(schedulers.updateScrapingScheduler, { status: "INACTIVE" });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { next_run_at: null } });
    if (jobs.length) expect(mocks.remove).toHaveBeenCalledWith("repeat-key");
    else expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not queue a scheduler without a cron expression", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "INACTIVE" });
    db.scrapingScheduler.update.mockResolvedValue({ status: "ACTIVATE", cron_expression: null });
    await call(schedulers.updateScrapingScheduler, { status: "ACTIVATE" });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it.each([[[]], [[{ response: { price: 4 }, scraper: { name: "shop" } }]]])("previews the latest completed scrape %j", async InstanceScrapes => {
    db.scrapingScheduler.findUnique.mockResolvedValue({ id: 12, title: "Prices", InstanceScrapes });
    const ctx = await call(schedulers.getScrapingSchedulerPreview);
    expect(ctx.json.mock.calls[0][0].latestData).toEqual(InstanceScrapes[0] ?? null);
    expect(db.scrapingScheduler.findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ InstanceScrapes: expect.objectContaining({ where: { status: "FINISHED" }, take: 1 }) }) }));
  });
  it("returns 404 for an unknown scheduler preview", async () => {
    db.scrapingScheduler.findUnique.mockResolvedValue(null);
    expect((await call(schedulers.getScrapingSchedulerPreview)).status).toHaveBeenCalledWith(404);
  });
});

describe("settings, permissions, images and AI", () => {
  it("encrypts secrets and updates only provided settings", async () => {
    await call(settings.updateSettings, { smtpPassword: "secret", smtpHost: "smtp.example.com", smtpUser: "mail", anthropicApiKey: "key", smtpPort: 465, role: "ADMIN" });
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { smtpPassword: "encrypted:secret", smtpHost: "encrypted:smtp.example.com", smtpUser: "encrypted:mail", anthropicApiKey: "encrypted:key", smtpPort: 465 } });
    await call(settings.updateSettings, { smtpPort: 587 });
    expect(db.settings.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { smtpPort: 587 } });
  });
  it("supports clearing configured secrets", async () => {
    await call(settings.updateSettings, { smtpPassword: "", smtpHost: "", smtpUser: "", anthropicApiKey: "", smtpPort: null });
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { smtpPassword: null, smtpHost: null, smtpUser: null, anthropicApiKey: null, smtpPort: null } });
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it("loads permissions for the target user", async () => {
    await call(permissions.getUserPermissionsByUserId);
    expect(db.userPermissions.findFirst).toHaveBeenCalledWith({ where: { userId: 12 } });
  });
  it("changes only explicitly supported permissions", async () => {
    await call(permissions.updateUserPermissions, { createDocument: false, role: "ADMIN", userId: 99 });
    expect(db.userPermissions.update).toHaveBeenCalledWith({ where: { userId: 12 }, data: expect.objectContaining({ createDocument: false }) });
    expect(db.userPermissions.update.mock.calls[0][0].data).not.toHaveProperty("role");
  });
  it("defends permission reads against non-admin direct calls", async () => {
    await call(permissions.getUserPermissionsByUserId, {}, { user: { id: 7, role: "USER" } });
    expect(db.userPermissions.findFirst).not.toHaveBeenCalled();
  });
  it("rechecks the current database role before changing permissions", async () => {
    db.user.findFirst.mockResolvedValue({ ...user, role: "USER" });
    await call(permissions.updateUserPermissions);
    expect(db.userPermissions.update).not.toHaveBeenCalled();
  });
  it("uploads an image before creating its metadata", async () => {
    const ctx = await call(images.createImage, { name: "photo", file_body: Buffer.from("photo") });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(ctx.status).toHaveBeenCalledWith(201);
  });
  it("does not save image metadata after an upload failure", async () => {
    mocks.upload.mockRejectedValue(new Error("Storage unavailable"));
    const ctx = await call(images.createImage, { name: "photo", file_body: Buffer.from("photo") });
    expect(ctx.next).toHaveBeenCalledWith(expect.objectContaining({ message: "Storage unavailable" }));
    expect(db.images.create).not.toHaveBeenCalled();
  });
  it.each([[[{ type: "text", text: "Answer" }]], [[{ type: "tool_use" }]], [null]])("handles AI content %j", async content => {
    mocks.response.mockResolvedValue(content);
    const ctx = await call(ai.sendMessage, { model_id: "model", message: "Question", document_id: 12 });
    expect(ctx.status).toHaveBeenCalledWith(201);
    if (content) expect(db.conversation.create).toHaveBeenCalledWith({ data: { message: "Question", response: content[0].type === "text" ? "Answer" : "Pas de réponse", model_id: "model", documentId: 12, authorId: 7 } });
    else expect(db.conversation.create).not.toHaveBeenCalled();
  });
  it("lists available AI models", async () => {
    expect((await call(ai.getModels)).json).toHaveBeenCalledWith([{ id: "model" }]);
  });
});

const deletes = [[scrapers.deleteScraper, db.scraper, "id"], [instances.deleteInstanceScrape, db.instanceScrape, "id"], [schedulers.deleteScrapingScheduler, db.scrapingScheduler, "id"], [images.deleteImage, db.images, "id"], [conversation.deleteConversationsByDocumentId, db.conversation, "documentId"]] as const;
it.each(deletes.map(([handler, model, key]) => ({ handler, model, key, name: handler.name })))("$name deletes only the requested resource", async ({ handler, model, key }) => {
  await call(handler);
  expect(key === "documentId" ? model.deleteMany : model.delete).toHaveBeenCalledWith({ where: { [key]: 12 } });
});

// A rejected dependency must reach Express's error handler, never a success response.
const modules = [users, auth, invitations, documents, documentHistory, conversation, scrapers, instances, instanceHistory, schedulers, settings, permissions, images, ai];
for (const module of modules) {
  for (const [name, handler] of Object.entries(module)) {
    it(`${name} forwards dependency failures`, async () => {
      const failure = new Error("Dependency unavailable");
      for (const model of Object.values(db)) for (const mock of Object.values(model)) mock.mockRejectedValue(failure);
      for (const mock of [mocks.email, mocks.hash, mocks.response, mocks.models, mocks.upload]) mock.mockRejectedValue(failure);
      const ctx = await call(handler, { password: "password-long", currentPassword: "old", newPassword: "password-long", email: "new@example.com" });
      // Logout has no database dependency; exercise a cookie write failure instead.
      if (name === "logout") {
        ctx.cookie.mockImplementation(() => { throw failure; });
        await handler(ctx.req, ctx.res, ctx.next);
      }
      expect(ctx.next).toHaveBeenCalledWith(failure);
    });
  }
}
