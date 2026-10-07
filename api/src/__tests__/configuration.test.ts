import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ redis: vi.fn(), queue: vi.fn(), adapter: vi.fn(), prisma: vi.fn(), s3: vi.fn(), listen: vi.fn(), dotenv: vi.fn() }));
vi.mock("ioredis", () => ({ default: class { constructor(options: unknown) { mocks.redis(options); } } }));
vi.mock("bullmq", () => ({ Queue: class { constructor(name: string, options: unknown) { mocks.queue(name, options); } } }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class { constructor(options: unknown) { mocks.adapter(options); } } }));
vi.mock("../generated/prisma/client", () => ({ PrismaClient: class { constructor(options: unknown) { mocks.prisma(options); } } }));
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: class { constructor(options: unknown) { mocks.s3(options); } } }));
vi.mock("../app", () => ({ default: { listen: mocks.listen } }));
vi.mock("dotenv", () => ({ default: { config: mocks.dotenv } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("uses documented local configuration defaults", async () => {
  for (const key of ["PORT", "NODE_ENV", "JWT_SECRET", "SECRET_JTW_KEY", "DATABASE_URL", "ENCRYPTION_KEY", "FRONTEND_URL", "REDIS_HOST", "REDIS_PORT", "REDIS_USERNAME", "REDIS_PASSWORD"]) vi.stubEnv(key, "");
  const { default: config } = await import("../config/config");
  expect(config).toEqual({ port: 3000, nodeEnv: "development", secretKey: "", databaseUrl: "", encryptionKey: "", frontendUrl: "http://localhost:5173", redis: { host: "127.0.0.1", port: 6379, username: "", password: "" } });
});
it("reads explicit environment settings", async () => {
  vi.stubEnv("PORT", "4000"); vi.stubEnv("REDIS_PORT", "6380"); vi.stubEnv("REDIS_HOST", "redis.test"); vi.stubEnv("JWT_SECRET", "test-secret"); vi.stubEnv("SECRET_JTW_KEY", "old-name");
  const { default: config } = await import("../config/config");
  expect(config.port).toBe(4000);
  expect(config.secretKey).toBe("test-secret");
  expect(config.redis).toMatchObject({ host: "redis.test", port: 6380 });
});
it("still accepts the former SECRET_JTW_KEY name", async () => {
  vi.stubEnv("JWT_SECRET", ""); vi.stubEnv("SECRET_JTW_KEY", "old-name");
  const { default: config } = await import("../config/config");
  expect(config.secretKey).toBe("old-name");
});
it("reports configuration errors and warnings per service", async () => {
  const { configProblems } = await import("../config/validateConfig");
  const valid = { databaseUrl: "postgresql://x", secretKey: "x".repeat(32), encryptionKey: "ab".repeat(32) } as never;
  expect(configProblems({ jwt: true, encryption: true }, valid)).toEqual({ errors: [], warnings: [] });
  expect(configProblems({}, { ...(valid as object), databaseUrl: "", secretKey: "", encryptionKey: "" } as never)).toEqual({ errors: [expect.stringContaining("DATABASE_URL")], warnings: [] });
  const broken = configProblems({ jwt: true, encryption: true }, { ...(valid as object), secretKey: "", encryptionKey: "not-hex" } as never);
  expect(broken.errors).toEqual([expect.stringContaining("JWT_SECRET"), expect.stringContaining("ENCRYPTION_KEY")]);
  expect(configProblems({ jwt: true }, { ...(valid as object), secretKey: "short" } as never)).toEqual({ errors: [], warnings: [expect.stringContaining("32 octets")] });
});
it("stops the service on invalid configuration and logs warnings", async () => {
  vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("JWT_SECRET", "short");
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { assertConfig } = await import("../config/validateConfig");
  assertConfig("api", { jwt: true });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("[api] JWT_SECRET fait moins de 32 octets"));
  expect(error).toHaveBeenCalledWith(expect.stringContaining("[api] Configuration invalide : DATABASE_URL"));
  expect(exit).toHaveBeenCalledWith(1);
});
it("configures a BullMQ connection compatible with blocking operations", async () => {
  await import("../config/queue");
  expect(mocks.redis).toHaveBeenCalledWith(expect.objectContaining({ maxRetriesPerRequest: null }));
  expect(mocks.queue).toHaveBeenCalledWith("scrape", expect.objectContaining({ connection: expect.any(Object) }));
});
it("uses the configured database URL for the Prisma adapter", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://test-only");
  await import("../config/prismaClient");
  expect(mocks.adapter).toHaveBeenCalledWith({ connectionString: "postgresql://test-only" });
  expect(mocks.prisma).toHaveBeenCalledWith({ adapter: expect.any(Object) });
});
it("configures S3's endpoint and path-style access", async () => {
  vi.stubEnv("S3_ENDPOINT", "https://s3.test"); vi.stubEnv("S3_ACCESS_KEY", "test-access"); vi.stubEnv("S3_SECRET_KEY", "test-secret");
  await import("../utils/s3Client");
  expect(mocks.s3).toHaveBeenCalledWith({ region: "us-east-1", endpoint: "https://s3.test", forcePathStyle: true, credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" } });
});
it("loads environment configuration and starts the API on its configured port", async () => {
  vi.stubEnv("PORT", "4000");
  mocks.listen.mockImplementation((_port, ready) => ready());
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("../server");
  expect(mocks.dotenv).toHaveBeenCalledOnce();
  expect(mocks.listen).toHaveBeenCalledWith(4000, expect.any(Function));
});
