import assert from "node:assert/strict";
import { test } from "node:test";
import { apiFetch } from "../src/api.ts";

test("API requests preserve headers and send the session cookie", async context => {
  let options: RequestInit | undefined;
  context.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { options = init; return new Response("{}"); });
  await apiFetch("/api/documents", { headers: new Headers({ Authorization: "Bearer test" }) });
  const headers = options!.headers as Headers;
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Authorization"), "Bearer test");
  assert.equal(options!.credentials, "include");
});
test("multipart uploads let the browser set the boundary", async context => {
  let options: RequestInit | undefined;
  context.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { options = init; return new Response("{}"); });
  const body = new FormData(); body.append("image", new Blob(["image"]), "photo.png");
  await apiFetch("/api/documents/12/images", { method: "POST", body });
  assert.equal((options!.headers as Headers).get("Content-Type"), null);
  assert.equal(options!.body, body);
  assert.equal(options!.credentials, "include");
});
