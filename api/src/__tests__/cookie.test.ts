import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "./helpers/http";
const config = vi.hoisted(() => ({ frontendUrl: "http://localhost:5173" }));
vi.mock("../config/config", () => ({ default: config }));
beforeEach(() => vi.resetModules());

// Cookie security follows the app's URL, not NODE_ENV: a production setup copied from
// .env.example (NODE_ENV=development) still gets secure cookies over https.
describe.each(["https://notes.example.com", "http://localhost:5173"])("cookies for %s", frontendUrl => {
  it("sets and clears the cookie with matching security and path attributes, for as long as the token", async () => {
    config.frontendUrl = frontendUrl;
    const secure = frontendUrl.startsWith("https://");
    const { setAuthCookie, clearAuthCookie } = await import("../utils/cookieUtils");
    const { res, cookie } = context();
    setAuthCookie(res, "token");
    const options = { httpOnly: true, secure, sameSite: secure ? "strict" : "lax", path: "/" };
    expect(cookie).toHaveBeenCalledWith("auth_token", "token", { ...options, maxAge: 2 * 86400000 });
    clearAuthCookie(res);
    expect(cookie).toHaveBeenLastCalledWith("auth_token", "", { ...options, maxAge: 0 });
  });
});
