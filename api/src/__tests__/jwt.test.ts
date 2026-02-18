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

  it("should decode a token with correct payload", () => {
    const token = createToken(user.id, user.username, user.email, user.role)!;
    const decoded = decodeToken(token) as Record<string, unknown>;

    expect(decoded.id).toBe(user.id);
    expect(decoded.username).toBe(user.username);
    expect(decoded.email).toBe(user.email);
    expect(decoded.role).toBe(user.role);
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
