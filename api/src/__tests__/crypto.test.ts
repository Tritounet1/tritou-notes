import { afterEach, describe, expect, it, vi } from "vitest";
const config = vi.hoisted(() => ({ encryptionKey: "ab".repeat(32) }));
vi.mock("../config/config", () => ({ default: config }));
import { decrypt, encrypt, makeid } from "../utils/utils";
afterEach(() => vi.restoreAllMocks());

describe("authenticated encryption", () => {
  it.each(["", "secret", "Un secret avec caractères 🔒", "x".repeat(10000)])("round trips UTF-8 payload %#", value => {
    expect(decrypt(encrypt(value))).toBe(value);
  });
  it("randomizes ciphertext and never logs the key or plaintext", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(encrypt("secret")).not.toBe(encrypt("secret"));
    expect(log).not.toHaveBeenCalled();
  });
  it("rejects ciphertext tampering", () => {
    const bytes = Buffer.from(encrypt("secret"), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decrypt(bytes.toString("base64"))).toThrow();
  });
  it("rejects a different encryption key", () => {
    const encrypted = encrypt("secret");
    config.encryptionKey = "cd".repeat(32);
    try { expect(() => decrypt(encrypted)).toThrow(); }
    finally { config.encryptionKey = "ab".repeat(32); }
  });
  it.each(["", "invalid", Buffer.alloc(20).toString("base64")])("rejects malformed envelopes %#", value => {
    expect(() => decrypt(value)).toThrow();
  });
});

describe("invitation token generation", () => {
  it("creates independent 64-character URL-safe tokens using cryptographic randomness", () => {
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Insecure randomness"); });
    const tokens = Array.from({ length: 100 }, () => makeid(64));
    expect(new Set(tokens).size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9]{64}$/);
  });
});
