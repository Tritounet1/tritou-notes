import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ decrypt: vi.fn(), transport: vi.fn(), verify: vi.fn(), mail: vi.fn(), messages: vi.fn(), models: vi.fn(), anthropic: vi.fn(), s3: vi.fn() }));
vi.mock("../utils/utils", () => ({ decrypt: mocks.decrypt }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { models = { list: mocks.models }; messages = { create: mocks.messages }; constructor(options: unknown) { mocks.anthropic(options); } } }));
vi.mock("../utils/s3Client", () => ({ s3Client: { send: mocks.s3 } }));
import { sendEmail } from "../config/mailClient";
import { getAnthropicModels, getResponse } from "../config/anthropicClient";
import { getFile, getPublicUrl, uploadFile } from "../utils/storageService";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  mocks.decrypt.mockImplementation(value => `decoded:${value}`);
  mocks.transport.mockReturnValue({ verify: mocks.verify, sendMail: mocks.mail });
  mocks.models.mockImplementation(async function* () { yield { id: "model-1" }; yield { id: "model-2" }; });
  mocks.messages.mockResolvedValue({ content: [{ type: "text", text: "Answer" }] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("SMTP adapter", () => {
  it("rejects missing configuration before attempting delivery", async () => {
    db.settings.findFirst.mockResolvedValue(null);
    await expect(sendEmail("to@example.com", "Subject", "HTML")).rejects.toThrow("SMTP not configured");
    expect(mocks.mail).not.toHaveBeenCalled();
  });
  it.each([465, 587])("decrypts SMTP settings and uses TLS for port %i", async port => {
    db.settings.findFirst.mockResolvedValue({ smtpHost: "host", smtpUser: "user", smtpPassword: "password", smtpPort: port });
    await sendEmail("to@example.com", "Subject", "<p>HTML</p>");
    expect(mocks.transport).toHaveBeenCalledWith({ host: "decoded:host", port, secure: port === 465, auth: { user: "decoded:user", pass: "decoded:password" } });
    expect(mocks.mail).toHaveBeenCalledWith({ from: "decoded:user", to: "to@example.com", subject: "Subject", html: "<p>HTML</p>" });
  });
  it("supports optional SMTP fields and the fallback sender", async () => {
    db.settings.findFirst.mockResolvedValue({});
    await sendEmail("to@example.com", "Subject", "HTML");
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ from: "tritou-notes@gmail.com" }));
  });
  it("still attempts delivery if transport verification fails", async () => {
    mocks.verify.mockRejectedValue(new Error("verify failed"));
    await sendEmail("to@example.com", "Subject", "HTML");
    expect(mocks.mail).toHaveBeenCalledOnce();
  });
  it("propagates delivery errors", async () => {
    mocks.mail.mockRejectedValue(new Error("delivery failed"));
    await expect(sendEmail("to@example.com", "Subject", "HTML")).rejects.toThrow("delivery failed");
  });
});

describe("Anthropic adapter", () => {
  it("decrypts the API key and collects paginated model results", async () => {
    db.settings.findFirst.mockResolvedValue({ anthropicApiKey: "key" });
    expect(await getAnthropicModels()).toEqual([{ id: "model-1" }, { id: "model-2" }]);
    expect(mocks.anthropic).toHaveBeenCalledWith({ apiKey: "decoded:key" });
  });
  it("sends the requested model and content with a token budget", async () => {
    db.settings.findFirst.mockResolvedValue({ anthropicApiKey: "key" });
    expect(await getResponse("model-1", "Question")).toEqual([{ type: "text", text: "Answer" }]);
    expect(mocks.messages).toHaveBeenCalledWith({ model: "model-1", max_tokens: 1024, messages: [{ role: "user", content: "Question" }] });
  });
  it.each([null, { anthropicApiKey: null }])("propagates missing/invalid key failures %j", async settings => {
    db.settings.findFirst.mockResolvedValue(settings);
    mocks.decrypt.mockImplementation(() => { throw new Error("No key"); });
    await expect(getResponse("model", "Question")).rejects.toThrow("No key");
    expect(mocks.messages).not.toHaveBeenCalled();
  });
  it("propagates API failures", async () => {
    mocks.messages.mockRejectedValue(new Error("API failed"));
    await expect(getResponse("model", "Question")).rejects.toThrow("API failed");
  });
});

describe("S3 adapter", () => {
  it("uploads bytes and their content type to the configured bucket", async () => {
    vi.stubEnv("S3_BUCKET", "test-bucket");
    const bytes = Buffer.from("image");
    await uploadFile(bytes, "photo.png", "image/png");
    expect(mocks.s3.mock.calls[0][0].input).toEqual({ Bucket: "test-bucket", Key: "photo.png", Body: bytes, ContentType: "image/png" });
  });
  it("retrieves the requested object", async () => {
    vi.stubEnv("S3_BUCKET", "test-bucket");
    mocks.s3.mockResolvedValue({ Body: "bytes" });
    expect(await getFile("photo.png")).toEqual({ Body: "bytes" });
    expect(mocks.s3.mock.calls[0][0].input).toEqual({ Bucket: "test-bucket", Key: "photo.png" });
  });
  it("propagates storage failures", async () => {
    mocks.s3.mockRejectedValue(new Error("S3 unavailable"));
    await expect(uploadFile(Buffer.from("a"), "key", "text/plain")).rejects.toThrow("S3 unavailable");
    await expect(getFile("key")).rejects.toThrow("S3 unavailable");
  });
  it("uses the configured public endpoint", () => {
    vi.stubEnv("S3_ENDPOINT", "https://storage.example.com");
    vi.stubEnv("S3_BUCKET", "assets");
    expect(getPublicUrl("photo.png")).toBe("https://storage.example.com/assets/photo.png");
  });
});
