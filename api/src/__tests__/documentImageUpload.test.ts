import { beforeEach, expect, it, vi } from "vitest";
import { context } from "./helpers/http";
const mocks = vi.hoisted(() => ({ error: undefined as Error | undefined, options: vi.fn(), field: vi.fn() }));
vi.mock("multer", async importOriginal => {
  const real = await importOriginal<{ default: typeof import("multer") }>();
  const multer = Object.assign((options: unknown) => {
    mocks.options(options);
    return { single: (field: string) => {
      mocks.field(field);
      return (_req: unknown, _res: unknown, next: (error?: Error) => void) => next(mocks.error);
    } };
  }, { memoryStorage: () => "bounded-memory", MulterError: real.default.MulterError });
  return { default: multer };
});
import multer from "multer";
import { documentImageUpload } from "../middlewares/documentImageUpload";
beforeEach(() => { mocks.error = undefined; });
it("bounds multipart parsing to one image without extra fields", () => {
  expect(mocks.options).toHaveBeenCalledWith({ storage: "bounded-memory", limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1, fieldNameSize: 50 } });
  expect(mocks.field).toHaveBeenCalledWith("image");
});
it("passes successfully parsed requests to the controller", async () => {
  const ctx = context(); await documentImageUpload(ctx.req, ctx.res, ctx.next);
  expect(ctx.next).toHaveBeenCalledExactlyOnceWith();
});
it.each([new multer.MulterError("LIMIT_FILE_SIZE"), new multer.MulterError("LIMIT_UNEXPECTED_FILE"), new Error("Invalid multipart boundary")])("formats upload errors %#", async error => {
  mocks.error = error;
  const ctx = context(); await documentImageUpload(ctx.req, ctx.res, ctx.next);
  expect(ctx.status).toHaveBeenCalledWith("code" in error && error.code === "LIMIT_FILE_SIZE" ? 413 : 400);
  expect(ctx.next).not.toHaveBeenCalled();
});
