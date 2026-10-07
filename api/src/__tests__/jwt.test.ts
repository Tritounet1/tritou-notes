import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/config", () => ({
  default: {
    secretKey: "2c1f304bbe12d0e73428ec71c3057fe0",
  },
}));

import { createToken, decodeToken } from "../utils/jwtUtils";

describe("JWT tests", () => {
  const user = {
    id: "1",
    username: "testuser",
    email: "test@test.com",
    role: "USER",
  };

  it("should create a valid token", () => {
    const token = createToken(user.id, user.username, user.email, user.role);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
  });

  it("carries the user's token version (0 by default)", () => {
    expect((decodeToken(createToken(user.id, user.username, user.email, user.role)!) as Record<string, unknown>).v).toBe(0);
    expect((decodeToken(createToken(user.id, user.username, user.email, user.role, 3)!) as Record<string, unknown>).v).toBe(3);
  });

  it("should decode a token with correct payload", () => {
    const token = createToken(user.id, user.username, user.email, user.role)!;
    const decoded = decodeToken(token) as Record<string, unknown>;

    expect(decoded.id).toBe(user.id);
    expect(decoded.username).toBe(user.username);
    expect(decoded.email).toBe(user.email);
    expect(decoded.role).toBe(user.role);
  });

  it("rejects expired tokens", () => {
    const token = jwt.sign({ id: "1" }, "2c1f304bbe12d0e73428ec71c3057fe0", { expiresIn: -1 });
    expect(() => decodeToken(token)).toThrow("jwt expired");
  });

  it("rejects tokens signed with another key", () => {
    const token = jwt.sign({ id: "1" }, "another-key");
    expect(() => decodeToken(token)).toThrow("invalid signature");
  });

  it("limits session validity to two days", () => {
    const decoded = decodeToken(createToken(user.id, user.username, user.email, user.role)!) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(2 * 86400);
  });

  it("should throw on invalid token", () => {
    expect(() => decodeToken("invalid-token")).toThrow();
  });

  it("should return undefined when secret key is empty", async () => {
    const config = await import("../config/config");
    config.default.secretKey = "";

    expect(
      createToken(user.id, user.username, user.email, user.role),
    ).toBeUndefined();
    expect(decodeToken("any-token")).toBeUndefined();

    config.default.secretKey = "2c1f304bbe12d0e73428ec71c3057fe0";
  });
});
