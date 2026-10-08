import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDatabase } from "./helpers/database";
vi.mock("../config/prismaClient", async () => ({ prisma: (await import("./helpers/database")).db }));
const mocks = vi.hoisted(() => ({ decrypt: vi.fn(), transport: vi.fn(), verify: vi.fn(), mail: vi.fn() }));
vi.mock("../utils/utils", () => ({ decrypt: mocks.decrypt }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.transport } }));
import { sendEmail } from "../config/mailClient";

beforeEach(() => {
  vi.resetAllMocks();
  resetDatabase();
  mocks.decrypt.mockImplementation(value => `decoded:${value}`);
  mocks.transport.mockReturnValue({ verify: mocks.verify, sendMail: mocks.mail });
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

