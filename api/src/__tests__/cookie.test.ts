import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "./helpers/http";
const config = vi.hoisted(() => ({ nodeEnv: "development" }));
vi.mock("../config/config", () => ({ default: config }));
beforeEach(() => vi.resetModules());

describe.each(["production", "development"])("cookies in %s", nodeEnv => {
  it("sets and clears the cookie with matching security and path attributes", async () => {
    config.nodeEnv = nodeEnv;
    const { setAuthCookie, clearAuthCookie } = await import("../utils/cookieUtils");
    const { res, cookie } = context();
    setAuthCookie(res, "token");
    const options = { httpOnly: true, secure: nodeEnv === "production", sameSite: nodeEnv === "production" ? "strict" : "lax", path: "/" };
    expect(cookie).toHaveBeenCalledWith("auth_token", "token", { ...options, maxAge: 7 * 86400000 });
    clearAuthCookie(res);
    expect(cookie).toHaveBeenLastCalledWith("auth_token", "", { ...options, maxAge: 0 });
  });
});
