vi.mock("../utils/documentImageStorage", async importOriginal => ({
  ...await importOriginal<typeof import("../utils/documentImageStorage")>(),
  removeDocumentImages: async () => {},
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase, user } from "./helpers/database";
import { call } from "./helpers/http";
import { cronRunsAround, recentRuns } from "../utils/schedulerRuns";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ hash: vi.fn(), verify: vi.fn(), token: vi.fn(), email: vi.fn(), encrypt: vi.fn(), response: vi.fn(), models: vi.fn(), add: vi.fn(), jobs: vi.fn(), remove: vi.fn() }));
vi.mock("../utils/bcryptUtils", () => ({ hashPassword: mocks.hash, verifyPassword: mocks.verify }));
vi.mock("../utils/jwtUtils", () => ({ createToken: mocks.token }));
vi.mock("../config/mailClient", () => ({ sendEmail: mocks.email }));
vi.mock("../utils/utils", () => ({ encrypt: mocks.encrypt, makeid: () => "safe-token" }));
vi.mock("../ai/openrouter", async importOriginal => ({
  ...await importOriginal<typeof import("../ai/openrouter")>(),
  chatCompletion: mocks.response, listTextModels: mocks.models, listImageModels: mocks.models, generateImage: mocks.response,
}));
vi.mock("../config/queue", () => ({ scrapeQueue: { add: mocks.add, upsertJobScheduler: mocks.jobs, removeJobScheduler: mocks.remove } }));
import * as users from "../controllers/userController";
import * as auth from "../controllers/authController";
import * as invitations from "../controllers/adminAuthController";
import * as documents from "../controllers/documentController";
import * as documentHistory from "../controllers/documentHistoryController";
import * as scrapers from "../controllers/scraperController";
import * as instances from "../controllers/instanceScrapeController";
import * as instanceHistory from "../controllers/instanceScrapeHistoryController";
import * as schedulers from "../controllers/scrapingSchedulerController";
import * as settings from "../controllers/settingsController";
import * as permissions from "../controllers/userPermissionsController";
import * as ai from "../controllers/aiController";
import { MAX_VERSIONS, MERGE_WINDOW_MS } from "../utils/documentRevision";
import { accountFailures, ipFailures } from "../utils/failureLimiter";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  mocks.hash.mockResolvedValue("new-hash");
  mocks.verify.mockResolvedValue(true);
  mocks.token.mockReturnValue("jwt");
  mocks.encrypt.mockImplementation(value => `encrypted:${value}`);
  mocks.response.mockResolvedValue({ role: "assistant", content: "Answer" });
  mocks.models.mockResolvedValue([{ id: "model" }]);
  mocks.jobs.mockResolvedValue([]);
  db.invitation.findUnique.mockResolvedValue({ email: "invited@example.com", used: false, expires_at: new Date(Date.now() + 10000) });
});

describe("user credentials", () => {
  it("hashes a new password and never returns credentials", async () => {
    const ctx = await call(users.createUser, { email: user.email, username: user.username, password: "password-long", role: "ADMIN" });
    expect(mocks.hash).toHaveBeenCalledWith("password-long");
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: user.email, username: user.username, password: "new-hash", userPermissions: { create: {} } } });
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
    // ...and sign the user out of every session.
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ password: "new-hash", tokenVersion: { increment: 1 } }) }));
  });
  it.each([null, [], "short", "é".repeat(37)])("rejects unsafe administrator resets: %s", async password => {
    const ctx = await call(users.updateUser, { password });
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it.each([users.getUserById, users.deleteUser])("omits password in single-user responses ($name)", async handler => {
    db.user.count.mockResolvedValue(2);
    const ctx = await call(handler);
    expect(ctx.json.mock.calls[0][0]).not.toHaveProperty("password");
  });
  it("refuses to delete a missing user or the last administrator", async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    expect((await call(users.deleteUser)).status).toHaveBeenCalledWith(404);
    db.user.count.mockResolvedValue(1);
    expect((await call(users.deleteUser)).status).toHaveBeenCalledWith(409);
    expect(db.user.count).toHaveBeenCalledWith({ where: { role: "ADMIN" } });
    db.user.findUnique.mockResolvedValue({ ...user, role: "USER" });
    expect((await call(users.deleteUser)).json).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(db.user.delete).toHaveBeenCalledOnce();
  });
  it("omits passwords in user listings", async () => {
    db.user.findMany.mockResolvedValue([user]);
    const ctx = await call(users.getUsers);
    expect(ctx.json.mock.calls[0][0][0]).not.toHaveProperty("password");
  });
});

describe("login and session", () => {
  beforeEach(() => {
    accountFailures.clear();
    ipFailures.clear();
  });
  it("authenticates by exact email with a protected cookie", async () => {
    const ctx = await call(auth.login, { email: " user@example.com ", username: "user", password: "password" });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "user@example.com" } });
    expect(ctx.cookie).toHaveBeenCalledWith("auth_token", "jwt", expect.objectContaining({ httpOnly: true, path: "/" }));
    expect(ctx.json.mock.calls[0][0].user).not.toHaveProperty("password");
  });
  it("authenticates by username only when it names a single account", async () => {
    db.user.findMany.mockResolvedValue([user]);
    expect((await call(auth.login, { email: "", username: "user", password: "password" })).cookie).toHaveBeenCalled();
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { username: "user" }, take: 2 });
    db.user.findMany.mockResolvedValue([user, { ...user, id: 8 }]);
    const ctx = await call(auth.login, { email: "", username: "user", password: "password" });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(ctx.cookie).not.toHaveBeenCalled();
  });
  it.each([{}, { email: { not: "" }, password: "x" }, { email: "", username: "", password: "x" }, { email: "a@b.c", password: ["x"] }, { username: "user" }])("rejects malformed credentials %j without querying", async body => {
    const ctx = await call(auth.login, body);
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it.each(["missing account", "wrong password"])("rejects %s without issuing a session", async reason => {
    if (reason === "missing account") db.user.findUnique.mockResolvedValue(null);
    else mocks.verify.mockResolvedValue(false);
    const ctx = await call(auth.login, { email: user.email, password: "wrong" });
    expect(ctx.status).toHaveBeenCalledWith(401);
    expect(ctx.cookie).not.toHaveBeenCalled();
    // An unknown account still pays for a bcrypt comparison.
    expect(mocks.verify).toHaveBeenCalledWith("wrong", reason === "missing account" ? "new-hash" : "stored-hash");
  });
  it("locks an account after 10 failures, whatever the case of the email", async () => {
    mocks.verify.mockResolvedValue(false);
    for (let i = 0; i < 10; i++) await call(auth.login, { email: i % 2 ? "USER@example.com" : user.email, password: "wrong" });
    mocks.verify.mockResolvedValue(true);
    const ctx = await call(auth.login, { email: user.email, password: "password" });
    expect(ctx.status).toHaveBeenCalledWith(429);
    expect(ctx.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(ctx.cookie).not.toHaveBeenCalled();
    // Other accounts are unaffected.
    expect((await call(auth.login, { email: "other@example.com", password: "password" })).cookie).toHaveBeenCalled();
  });
  it("resets the account counter after a successful login", async () => {
    mocks.verify.mockResolvedValue(false);
    for (let i = 0; i < 9; i++) await call(auth.login, { email: user.email, password: "wrong" });
    mocks.verify.mockResolvedValue(true);
    await call(auth.login, { email: user.email, password: "password" });
    mocks.verify.mockResolvedValue(false);
    await call(auth.login, { email: user.email, password: "wrong" });
    expect((await call(auth.login, { email: user.email, password: "wrong" })).status).toHaveBeenCalledWith(401);
  });
  it("forwards token-generation failures without a cookie", async () => {
    mocks.token.mockReturnValue(undefined);
    const ctx = await call(auth.login, { email: user.email, password: "password" });
    expect(ctx.next).toHaveBeenCalledWith(expect.any(Error));
    expect(ctx.cookie).not.toHaveBeenCalled();
  });
  it("signs out every session on request", async () => {
    const ctx = await call(auth.logoutEverywhere);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { tokenVersion: { increment: 1 } } });
    expect(ctx.cookie).toHaveBeenCalledWith("auth_token", "", expect.objectContaining({ maxAge: 0 }));
    expect(ctx.status).toHaveBeenCalledWith(200);
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
  it("limits wrong current passwords", async () => {
    accountFailures.clear();
    mocks.verify.mockResolvedValue(false);
    for (let i = 0; i < 10; i++) expect((await call(auth.changePassword, { currentPassword: "guess", newPassword: "new-password" })).status).toHaveBeenCalledWith(401);
    mocks.verify.mockResolvedValue(true);
    expect((await call(auth.changePassword, { currentPassword: "old-password", newPassword: "new-password" })).status).toHaveBeenCalledWith(429);
    expect(db.user.update).not.toHaveBeenCalled();
    accountFailures.clear();
    expect((await call(auth.changePassword, { currentPassword: "old-password", newPassword: "new-password" })).status).toHaveBeenCalledWith(200);
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
  it("rejects a malformed email", async () => {
    expect((await call(invitations.sendInvitation, { email: "not-an-email" })).status).toHaveBeenCalledWith(400);
    expect(db.invitation.create).not.toHaveBeenCalled();
  });
  it.each([
    [{ username: "", password: "password-long" }, "Nom d'utilisateur"],
    [{ username: "x".repeat(51), password: "password-long" }, "Nom d'utilisateur"],
    [{ username: "new", password: "short" }, "8 caractères"],
    [{ username: "new", password: ["password-long"] }, "8 caractères"],
  ])("refuses an invalid registration %j before touching the invitation", async (body, message) => {
    const ctx = await call(invitations.registerWithInvitation, body);
    expect(ctx.status).toHaveBeenCalledWith(400);
    expect(ctx.json).toHaveBeenCalledWith({ message: expect.stringContaining(message) });
    expect(db.invitation.findUnique).not.toHaveBeenCalled();
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
    db.invitation.updateMany.mockResolvedValue({ count: 1 });
    const ctx = await call(invitations.registerWithInvitation, { username: "new", password: "password-long", role: "ADMIN", email: "attacker@example.com" });
    expect(db.invitation.updateMany).toHaveBeenCalledWith({ where: { token: "invitation", used: false }, data: { used: true } });
    expect(db.user.create).toHaveBeenCalledWith({
      data: { email: "invited@example.com", username: "new", password: "new-hash", role: "USER", userPermissions: { create: { createDocument: true, modifyDocument: true, deleteDocument: true } } },
      include: { userPermissions: true },
    });
    expect(ctx.status).toHaveBeenCalledWith(201);
    expect(ctx.json.mock.calls[0][0].user).not.toHaveProperty("password");
  });
  it("lets only one of two simultaneous registrations claim the invitation", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.invitation.updateMany.mockResolvedValue({ count: 0 });
    expect((await call(invitations.registerWithInvitation, { username: "new", password: "password-long" })).status).toHaveBeenCalledWith(400);
    expect(db.user.create).not.toHaveBeenCalled();
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
  [schedulers.getScrapingSchedulerById, db.scrapingScheduler],
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
  [documents.getDocuments, db.document],
  [scrapers.getScrapers, db.scraper],
  [instances.getInstancesScrape, db.instanceScrape], [instanceHistory.getInstancesScrapeHistory, db.instanceScrapeHistory],
  [schedulers.getScrapingScheduler, db.scrapingScheduler], [settings.getSettings, db.settings],
] as const;
it.each(lists.map(([handler, model]) => ({ handler, model, name: handler.name })))("$name returns an empty collection", async ({ handler, model }) => {
  const ctx = await call(handler);
  expect(model.findMany).toHaveBeenCalledOnce();
  expect(ctx.json).toHaveBeenCalledWith([]);
});
it("filters instance histories by their instance", async () => {
  const ctx = await call(instanceHistory.getInstancesScrapeHistoryByInstanceScrapeId);
  expect(db.instanceScrapeHistory.findMany).toHaveBeenCalledWith({ where: { instanceScrapeId: 12 } });
  expect(ctx.json).toHaveBeenCalledWith([]);
});
it("returns the latest document versions, oldest first", async () => {
  db.documentHistory.findMany.mockResolvedValue([{ id: 3 }, { id: 2 }]);
  const ctx = await call(documentHistory.getDocumentHistoriesByDocumentId);
  expect(db.documentHistory.findMany).toHaveBeenCalledWith({ where: { documentId: 12 }, orderBy: [{ created_at: "desc" }, { id: "desc" }], take: MAX_VERSIONS });
  expect(ctx.json).toHaveBeenCalledWith([{ id: 2 }, { id: 3 }]);
});

describe("document lifecycle", () => {
  it("uses the authenticated author when creating a document", async () => {
    const ctx = await call(documents.createDocument, { title: "Note", type: "TEXT", authorId: 99 });
    expect(db.document.create).toHaveBeenCalledWith({ data: { title: "Note", type: "TEXT", lastEditor: { connect: { id: 7 } }, author: { connect: { id: 7 } } } });
    expect(ctx.status).toHaveBeenCalledWith(201);
  });
  it.each([documents.createDocument, documents.updateDocument])("%s rejects missing authors", async handler => {
    db.user.findFirst.mockResolvedValue(null);
    expect((await call(handler)).next).toHaveBeenCalledWith(expect.any(Error));
    expect(db.document.create).not.toHaveBeenCalled();
    expect(db.document.update).not.toHaveBeenCalled();
  });
  it("saves the previous contents, credited to their writer, and keeps the creator", async () => {
    db.document.findFirst.mockResolvedValue({ id: 12, title: "Old", text: "Before", public: false, authorId: 3, lastEditorId: 5 });
    await call(documents.updateDocument, { title: "New", text: "After", is_public: true });
    expect(db.documentHistory.create).toHaveBeenCalledWith({ data: { title: "Old", text: "Before", public: false, document: { connect: { id: 12 } }, author: { connect: { id: 5 } } } });
    expect(db.document.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { title: "New", text: "After", public: true, lastEditor: { connect: { id: 7 } }, last_update: expect.any(Date) } });

    // Without a recorded last editor the content is the creator's; without either, no author.
    db.document.findFirst.mockResolvedValue({ id: 12, title: "Old", text: "Before", public: false, authorId: 3, lastEditorId: null });
    await call(documents.updateDocument, { text: "Again" });
    expect(db.documentHistory.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ author: { connect: { id: 3 } } }) });
    db.document.findFirst.mockResolvedValue({ id: 12, title: "Old", text: "Before", public: false, authorId: null, lastEditorId: null });
    await call(documents.updateDocument, { text: "Again" });
    expect(db.documentHistory.create.mock.lastCall![0].data).not.toHaveProperty("author");
    expect(db.documentHistory.create.mock.invocationCallOrder[0]).toBeLessThan(db.document.update.mock.invocationCallOrder[0]);
  });
  it("creates no version when title, text and visibility are unchanged", async () => {
    db.document.findFirst.mockResolvedValue({ id: 12, title: "Same", text: "Same", public: false });
    await call(documents.updateDocument, { title: "Same", text: "Same", is_public: false, parentId: null });
    expect(db.documentHistory.create).not.toHaveBeenCalled();
    expect(db.document.update).toHaveBeenCalled();
  });
  it("groups the editor saves of one author into a version per 10 minutes", async () => {
    // Same editor as the last save, and a version taken a minute ago: same session.
    db.document.findFirst.mockResolvedValue({ id: 12, title: "T", text: "Before", public: false, lastEditorId: 7 });
    db.documentHistory.findFirst.mockResolvedValue({ id: 5, created_at: new Date(Date.now() - 60_000) });
    await call(documents.updateDocument, { text: "After" });
    expect(db.documentHistory.findFirst).toHaveBeenCalledWith({ where: { documentId: 12 }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    expect(db.documentHistory.create).not.toHaveBeenCalled();
    expect(db.document.update).toHaveBeenCalled();

    // Someone else edited last, or the session is older than the window, or no version yet.
    for (const [lastEditorId, latest] of [[8, { id: 5, created_at: new Date() }], [7, { id: 5, created_at: new Date(Date.now() - MERGE_WINDOW_MS - 1) }], [7, null]] as const) {
      db.documentHistory.create.mockClear();
      db.document.findFirst.mockResolvedValue({ id: 12, title: "T", text: "Before", public: false, lastEditorId });
      db.documentHistory.findFirst.mockResolvedValue(latest);
      await call(documents.updateDocument, { text: "After" });
      expect(db.documentHistory.create).toHaveBeenCalledOnce();
    }
  });
  it("keeps the newest versions only", async () => {
    db.document.findFirst.mockResolvedValue({ id: 12, title: "T", text: "Before", public: false });
    db.documentHistory.findFirst.mockResolvedValue(null);
    db.documentHistory.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await call(documents.updateDocument, { text: "After" });
    expect(db.documentHistory.findMany).toHaveBeenCalledWith({ where: { documentId: 12 }, orderBy: [{ created_at: "desc" }, { id: "desc" }], skip: MAX_VERSIONS, select: { id: true } });
    expect(db.documentHistory.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } });
    db.documentHistory.deleteMany.mockClear();
    db.documentHistory.findMany.mockResolvedValue([]);
    await call(documents.updateDocument, { text: "Again" });
    expect(db.documentHistory.deleteMany).not.toHaveBeenCalled();
  });
  it("refuses a save based on an outdated version and returns the saved one", async () => {
    const saved = { id: 12, title: "T", text: "From the assistant", public: false, last_update: new Date("2026-10-07T10:00:05Z") };
    db.document.findFirst.mockResolvedValue(saved);
    db.document.findUnique.mockResolvedValue(saved);
    const ctx = await call(documents.updateDocument, { text: "Mine", expectedLastUpdate: "2026-10-07T10:00:00.000Z" });
    expect(ctx.status).toHaveBeenCalledWith(409);
    expect(ctx.json).toHaveBeenCalledWith({ message: expect.stringContaining("modifiée entre-temps"), document: saved });
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.documentHistory.create).not.toHaveBeenCalled();

    // Matching version: the update is conditioned on it.
    await call(documents.updateDocument, { text: "Mine", expectedLastUpdate: saved.last_update.toISOString() });
    expect(db.document.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 12, last_update: saved.last_update } }));
  });
  it("turns a concurrent write during the save into a conflict", async () => {
    const lastUpdate = new Date("2026-10-07T10:00:00Z");
    db.document.findFirst.mockResolvedValue({ id: 12, title: "T", text: "A", public: false, last_update: lastUpdate });
    db.document.update.mockRejectedValue(Object.assign(new Error("No record"), { code: "P2025" }));
    db.document.findUnique.mockRejectedValue(new Error("gone"));
    const ctx = await call(documents.updateDocument, { text: "B", expectedLastUpdate: lastUpdate.toISOString() });
    expect(ctx.status).toHaveBeenCalledWith(409);
    expect(ctx.json).toHaveBeenCalledWith(expect.objectContaining({ document: null }));
    // Without an expected version, Prisma errors are not conflicts.
    expect((await call(documents.updateDocument, { text: "B" })).next).toHaveBeenCalledWith(expect.objectContaining({ code: "P2025" }));
  });
  it("rejects an invalid expected version", async () => {
    expect((await call(documents.updateDocument, { text: "B", expectedLastUpdate: "yesterday" })).status).toHaveBeenCalledWith(400);
    expect(db.document.update).not.toHaveBeenCalled();
  });
  it("does not update a missing document", async () => {
    db.document.findFirst.mockResolvedValue(null);
    expect((await call(documents.updateDocument)).next).toHaveBeenCalledWith(expect.any(Error));
    expect(db.documentHistory.create).not.toHaveBeenCalled();
  });
  it("deletes a document in one statement (histories cascade)", async () => {
    await call(documents.deleteDocument);
    expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    expect(db.documentHistory.deleteMany).not.toHaveBeenCalled();
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
  it("lets only admins change scraper code", async () => {
    db.scraper.findFirst.mockResolvedValue({ id: 12, code: "result = 1" });
    const user = { user: { id: 8, role: "USER" } };
    expect((await call(scrapers.updateScraper, { code: "result = process.env" }, user)).status).toHaveBeenCalledWith(403);
    expect(db.scraper.update).not.toHaveBeenCalled();
    // The page sends every field on save: an unchanged code is fine.
    await call(scrapers.updateScraper, { name: "Renamed", code: "result = 1" }, user);
    expect(db.scraper.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Renamed", code: "result = 1" }) }));
  });
  it("validates scraper base URLs", async () => {
    expect((await call(scrapers.updateScraper, { base_url: "https://a.example" })).status).toHaveBeenCalledWith(400);
    expect((await call(scrapers.updateScraper, { base_url: ["http://127.0.0.1:5432"] })).next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(db.scraper.update).not.toHaveBeenCalled();
  });
  it("refuses to scrape internal addresses", async () => {
    expect((await call(instances.createInstanceScrape, { url: "http://169.254.169.254/latest/meta-data/" })).next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(db.instanceScrape.create).not.toHaveBeenCalled();
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
    expect(db.instanceScrape.create).toHaveBeenCalledWith({ data: { url: "https://example.com/", scrapingSchedulerId: 3, scraperId: 4 } });
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
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "DESACTIVATE" });
    db.scrapingScheduler.update.mockResolvedValue({ id: 12, status: "ACTIVATE", cron_expression: "0 * * * *" });
    await call(schedulers.updateScrapingScheduler, { status: "ACTIVATE", cron_expression: "0 * * * *" });
    expect(mocks.jobs).toHaveBeenCalledWith("scheduler-12", { pattern: "0 * * * *" }, { name: "scheduler-12", data: { schedulerId: 12 } });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { start_at: expect.any(Date), next_run_at: expect.any(Date) } });
  });
  it("deactivates a scheduler and removes its job scheduler", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "ACTIVATE", cron_expression: "0 * * * *" });
    db.scrapingScheduler.update.mockResolvedValue({ status: "DESACTIVATE" });
    await call(schedulers.updateScrapingScheduler, { status: "DESACTIVATE" });
    expect(db.scrapingScheduler.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { next_run_at: null } });
    expect(mocks.remove).toHaveBeenCalledWith("scheduler-12");
  });
  it("does not queue a scheduler without a cron expression", async () => {
    db.scrapingScheduler.findFirst.mockResolvedValue({ status: "DESACTIVATE" });
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
    await call(settings.updateSettings, { smtpPassword: "secret", smtpHost: "smtp.example.com", smtpUser: "mail", openrouterApiKey: "key", aiTextModel: "openai/gpt-x", smtpPort: 465, role: "ADMIN" });
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { smtpPassword: "encrypted:secret", smtpHost: "encrypted:smtp.example.com", smtpUser: "encrypted:mail", openrouterApiKey: "encrypted:key", aiTextModel: "openai/gpt-x", smtpPort: 465 } });
    await call(settings.updateSettings, { smtpPort: 587 });
    expect(db.settings.update).toHaveBeenLastCalledWith({ where: { id: 12 }, data: { smtpPort: 587 } });
  });
  it("supports clearing configured secrets", async () => {
    await call(settings.updateSettings, { smtpPassword: "", smtpHost: "", smtpUser: "", openrouterApiKey: "", aiImageModel: "", smtpPort: null });
    expect(db.settings.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { smtpPassword: null, smtpHost: null, smtpUser: null, openrouterApiKey: null, aiImageModel: null, smtpPort: null } });
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
    expect((await call(permissions.getUserPermissionsByUserId, {}, { user: { id: 7, role: "USER" } })).status).toHaveBeenCalledWith(403);
    expect(db.userPermissions.findFirst).not.toHaveBeenCalled();
  });
  it("answers 404 for a user without permissions", async () => {
    db.userPermissions.findFirst.mockResolvedValue(null);
    expect((await call(permissions.getUserPermissionsByUserId)).status).toHaveBeenCalledWith(404);
  });
  it("rechecks the current database role before changing permissions", async () => {
    db.user.findFirst.mockResolvedValue({ ...user, role: "USER" });
    expect((await call(permissions.updateUserPermissions)).status).toHaveBeenCalledWith(403);
    expect(db.userPermissions.update).not.toHaveBeenCalled();
  });
});

const deletes = [[scrapers.deleteScraper, db.scraper, "id"], [instances.deleteInstanceScrape, db.instanceScrape, "id"], [schedulers.deleteScrapingScheduler, db.scrapingScheduler, "id"]] as const;
it.each(deletes.map(([handler, model, key]) => ({ handler, model, key, name: handler.name })))("$name deletes only the requested resource", async ({ handler, model, key }) => {
  await call(handler);
  expect(model.delete).toHaveBeenCalledWith({ where: { [key]: 12 } });
});

// A rejected dependency must reach Express's error handler, never a success response.
const modules = [users, auth, invitations, documents, documentHistory, scrapers, instances, instanceHistory, schedulers, settings, permissions, ai];
for (const module of modules) {
  for (const [name, handler] of Object.entries(module)) {
    it(`${name} forwards dependency failures`, async () => {
      const failure = new Error("Dependency unavailable");
      for (const model of Object.values(db)) for (const mock of Object.values(model)) mock.mockRejectedValue(failure);
      for (const mock of [mocks.email, mocks.hash, mocks.response, mocks.models]) mock.mockRejectedValue(failure);
      const ctx = await call(handler, { username: "new", password: "password-long", currentPassword: "old", newPassword: "password-long", email: "new@example.com", url: "https://example.com" });
      // Logout has no database dependency; exercise a cookie write failure instead.
      if (name === "logout") {
        ctx.cookie.mockImplementation(() => { throw failure; });
        await handler(ctx.req, ctx.res, ctx.next);
      }
      expect(ctx.next).toHaveBeenCalledWith(failure);
    });
  }
}

describe("scheduler list extras", () => {
  it("merges current instance statuses with history, oldest first, capped at 14", () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 6, h));
    const runs = recentRuns(
      [{ status: "FINISHED", last_update: at(20) }],
      Array.from({ length: 14 }, (_, i) => ({ status: i === 0 ? "ERROR" : "FINISHED", created_at: at(19 - i) })),
    );
    expect(runs).toHaveLength(14);
    expect(runs[13]).toEqual({ status: "FINISHED", at: at(20) });
    expect(runs[12]).toEqual({ status: "ERROR", at: at(19) });
  });
  it("lists cron runs within 24 h around now and ignores invalid expressions", () => {
    const now = new Date("2026-10-06T12:30:00Z");
    const runs = cronRunsAround("0 */6 * * *", now);
    expect(runs.length).toBeGreaterThanOrEqual(7);
    expect(runs.length).toBeLessThanOrEqual(9);
    runs.forEach((r) => expect(Math.abs(new Date(r).getTime() - now.getTime())).toBeLessThanOrEqual(24 * 3_600_000));
    expect(cronRunsAround("not a cron", now)).toEqual([]);
    expect(cronRunsAround(null, now)).toEqual([]);
  });
});
