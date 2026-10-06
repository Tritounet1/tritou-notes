import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import type { PrismaClient } from "../../generated/prisma/client";
// External mail is intentionally replaced; HTTP, Prisma, PostgreSQL and Redis are real.
vi.mock("../../config/mailClient", () => ({ sendEmail: vi.fn() }));

if (process.env.BACKEND_INTEGRATION !== "1" || process.env.DATABASE_URL !== "postgresql://backend_test:backend_test@127.0.0.1:55432/backend_test" || process.env.REDIS_PORT !== "56379") {
  throw new Error("Run npm run test:integration to use the isolated test services.");
}
let prisma: PrismaClient;
let queue: Queue;
let server: Server;
let base: string;
let token: string;
let regularToken: string;
let regularId: number;
let documentId: number;
let instanceId: number;
let schedulerId: number;

async function request(path: string, method = "GET", body?: unknown, auth = token) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}
beforeAll(async () => {
  ({ prisma } = await import("../../config/prismaClient"));
  ({ scrapeQueue: queue } = await import("../../config/queue"));
  const { hashPassword } = await import("../../utils/bcryptUtils");
  const { createToken } = await import("../../utils/jwtUtils");
  const admin = await prisma.user.create({ data: { email: "admin@test.example", username: "admin", password: await hashPassword("admin-password"), role: "ADMIN" } });
  const regular = await prisma.user.create({ data: { email: "user@test.example", username: "user", password: await hashPassword("old-password") } });
  regularId = regular.id;
  await prisma.userPermissions.create({ data: { userId: regular.id, createDocument: true, modifyDocument: true, deleteDocument: true } });
  token = createToken(String(admin.id), admin.username, admin.email, admin.role)!;
  regularToken = createToken(String(regular.id), regular.username, regular.email, regular.role)!;
  const { default: app } = await import("../../app");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (queue) { const client = await queue.client; await queue.close(); await client.quit(); }
  if (prisma) await prisma.$disconnect();
});

describe("real HTTP + PostgreSQL + Redis", () => {
  it("serves health checks and CORS headers without authentication", async () => {
    const response = await request("/health", "GET", undefined, "");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });
  it("denies anonymous protected requests", async () => {
    expect((await request("/api/users", "GET", undefined, "")).status).toBe(401);
  });
  it("authenticates with real bcrypt and JWT, setting an HttpOnly cookie", async () => {
    const response = await request("/auth/login", "POST", { email: "user@test.example", password: "old-password" }, "");
    expect(response.status).toBe(200);
    expect(response.data.user).not.toHaveProperty("password");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await request("/auth/login", "POST", { email: "user@test.example", password: "wrong" }, "")).status).toBe(401);
  });
  it("rejects non-admin invitations and settings access", async () => {
    expect((await request("/api/admin-auth/invite", "POST", { email: "invited@test.example" }, regularToken)).status).toBe(401);
    expect((await request("/api/settings", "GET", undefined, regularToken)).status).toBe(401);
  });
  it("creates an admin-managed user with a usable hash and default permissions", async () => {
    const response = await request("/api/users", "POST", { email: "managed@test.example", username: "managed", password: "managed-password" });
    expect(response.status).toBe(201);
    expect(response.data).not.toHaveProperty("password");
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: response.data.id }, include: { userPermissions: true } });
    expect(stored.password).toMatch(/^\$2[ab]\$/);
    expect(stored.userPermissions?.modifyScraper).toBe(false);
    expect((await request("/auth/login", "POST", { email: stored.email, password: "managed-password" }, "")).status).toBe(200);
  });
  it("updates only the current account's password", async () => {
    const response = await request("/auth/change-password", "POST", { currentPassword: "old-password", newPassword: "new-password", id: 1, role: "ADMIN" }, regularToken);
    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: regularId } })).role).toBe("USER");
    expect((await request("/auth/login", "POST", { email: "user@test.example", password: "old-password" }, "")).status).toBe(401);
    expect((await request("/auth/login", "POST", { email: "user@test.example", password: "new-password" }, "")).status).toBe(200);
  });
  it("creates a document under the authenticated author", async () => {
    const response = await request("/api/documents", "POST", { title: "Initial", type: "TEXT", authorId: 1 }, regularToken);
    expect(response.status).toBe(201);
    documentId = response.data.id;
    expect(response.data.authorId).toBe(regularId);
  });
  it("archives and updates document content in PostgreSQL", async () => {
    const response = await request(`/api/documents/${documentId}`, "PUT", { title: "Updated", text: "Content", is_public: true }, regularToken);
    expect(response.status).toBe(200);
    const history = await prisma.documentHistory.findMany({ where: { documentId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ title: "Initial", text: "", public: false, authorId: regularId });
  });
  it("allows anonymous public document reads but blocks modifications", async () => {
    expect((await request(`/api/documents/${documentId}`, "GET", undefined, "")).status).toBe(200);
    expect((await request(`/api/documents/${documentId}`, "DELETE", undefined, "")).status).toBe(401);
    expect((await request(`/api/document-histories/${documentId}`, "GET", undefined, "")).status).toBe(401);
  });
  it("creates a scrape and enqueues its persisted ID in Redis", async () => {
    const response = await request("/api/instance-scrape", "POST", { url: "https://example.com" });
    expect(response.status).toBe(201);
    instanceId = response.data.id;
    const waiting = await queue.getWaiting();
    expect(waiting.some(job => job.name === "scrape-url" && job.data.id === instanceId)).toBe(true);
  });
  it("enforces real stored permissions on scraping routes", async () => {
    expect((await request("/api/instance-scrape", "POST", { url: "https://example.com" }, regularToken)).status).toBe(403);
    await prisma.userPermissions.update({ where: { userId: regularId }, data: { useScraper: true } });
    expect((await request("/api/instance-scrape", "POST", { url: "https://example.com" }, regularToken)).status).toBe(201);
  });
  it("activates and deactivates a real recurring BullMQ job", async () => {
    const created = await request("/api/scraping-schedulers", "POST", { title: "Scheduled" });
    expect(created.status).toBe(201);
    schedulerId = created.data.id;
    expect((await request(`/api/scraping-schedulers/${schedulerId}`, "PUT", { status: "ACTIVATE", cron_expression: "0 * * * *" })).status).toBe(200);
    expect((await queue.getRepeatableJobs()).some(job => job.name === `scheduler-${schedulerId}`)).toBe(true);
    expect((await prisma.scrapingScheduler.findUniqueOrThrow({ where: { id: schedulerId } })).next_run_at).toBeInstanceOf(Date);
    expect((await request(`/api/scraping-schedulers/${schedulerId}`, "PUT", { status: "DESACTIVATE" })).status).toBe(200);
    expect((await queue.getRepeatableJobs()).some(job => job.name === `scheduler-${schedulerId}`)).toBe(false);
  });
  it("stores encrypted settings that decrypt correctly", async () => {
    const response = await request("/api/settings/1", "PUT", { smtpPassword: "smtp-secret", smtpPort: 587 });
    expect(response.status).toBe(200);
    const stored = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
    expect(stored.smtpPassword).not.toBe("smtp-secret");
    const { decrypt } = await import("../../utils/utils");
    expect(decrypt(stored.smtpPassword!)).toBe("smtp-secret");
  });
  it("registers by invitation and rejects token reuse", async () => {
    await prisma.invitation.create({ data: { email: "invited@test.example", token: "integration-invitation", expires_at: new Date(Date.now() + 10000) } });
    const response = await request("/api/admin-auth/invitation/integration-invitation", "POST", { username: "invited", password: "invited-password", role: "ADMIN" }, "");
    expect(response.status).toBe(201);
    expect(response.data.user.role).toBe("USER");
    expect((await request("/api/admin-auth/invitation/integration-invitation", "POST", { username: "invited", password: "invited-password" }, "")).status).toBe(400);
  });
  it("lets BullMQ consume and complete a job against real Redis", async () => {
    const connection = { host: "127.0.0.1", port: 56379 };
    const testQueue = new Queue("integration-consumption", { connection });
    const worker = new Worker("integration-consumption", async job => ({ id: job.data.id }), { connection });
    try {
      const completed = once(worker, "completed");
      await testQueue.add("test", { id: instanceId });
      const [job, result] = await completed;
      expect(result).toEqual({ id: instanceId });
      expect(await job.getState()).toBe("completed");
    } finally { await worker.close(); await testQueue.close(); }
  });
  it("deletes document histories and their parent without foreign-key errors", async () => {
    expect((await request(`/api/documents/${documentId}`, "DELETE", undefined, regularToken)).status).toBe(200);
    expect(await prisma.document.findUnique({ where: { id: documentId } })).toBeNull();
    expect(await prisma.documentHistory.count({ where: { documentId } })).toBe(0);
  });
});
