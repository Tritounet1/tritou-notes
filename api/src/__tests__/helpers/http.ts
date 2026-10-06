import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import { vi } from "vitest";

export function context(body: unknown = {}, overrides: Record<string, unknown> = {}) {
  const req = { body, params: { id: "12", token: "invitation" }, query: {}, headers: {}, cookies: {}, method: "GET", path: "/", user: { id: 7, role: "ADMIN", email: "admin@example.com", username: "admin" }, ...overrides } as unknown as Request<{ id: string; token: string }>;
  const status = vi.fn();
  const json = vi.fn();
  const cookie = vi.fn();
  const res = { status, json, cookie } as unknown as Response;
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  const next = vi.fn();
  return { req, res, next, status, json, cookie };
}

export async function call(handler: (req: Request<{ id: string; token: string }>, res: Response, next: NextFunction) => unknown, body: unknown = {}, overrides: Record<string, unknown> = {}) {
  const ctx = context(body, overrides);
  await handler(ctx.req, ctx.res, ctx.next);
  return ctx;
}

// Runs the real Express router and middleware chain without opening a TCP port.
export async function dispatch(router: Router, method: string, url: string, overrides: Record<string, unknown> = {}) {
  const ctx = context({}, { method, url, path: url.split("?")[0], ...overrides });
  await new Promise<void>((resolve, reject) => {
    ctx.json.mockImplementation(() => { resolve(); return ctx.res; });
    const next: NextFunction = error => error ? reject(error) : resolve();
    (router as RequestHandler)(ctx.req, ctx.res, next);
  });
  return ctx;
}
