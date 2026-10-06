import assert from "node:assert/strict";
import { test } from "node:test";
import { imageEndpoint, insertImageBlocks, parseDocumentImage, serializeDocumentImage } from "../src/utils/documentImages.ts";
import { normalizeSegments, parseSegments, segmentsToText } from "../src/utils/documentSegments.ts";
const data = { id: "fe4fa050-31a0-4c4c-a7bb-b5eedc34bb0d", caption: "Photo d’été 🔆", alt: "photo.png", width: 75 };

test("image captions and width survive serialization and document reloading", () => {
  const source = `Before\n${serializeDocumentImage(data)}\nAfter`;
  const segments = normalizeSegments(parseSegments(source));
  assert.equal(segmentsToText(segments), source);
  assert.deepEqual(segments.find(segment => segment.type === "image"), { type: "image", data, source: serializeDocumentImage(data) });
});
test("image markers inside code remain literal", () => {
  const source = `\`\`\`markdown\n${serializeDocumentImage(data)}\n\`\`\`\n`;
  assert.equal(parseSegments(source).filter(segment => segment.type === "image").length, 0);
  assert.equal(segmentsToText(parseSegments(source)), source);
});
test("unsafe references and invalid dimensions remain ordinary text", () => {
  for (const bad of [{ ...data, id: "../../secret" }, { ...data, id: [data.id] }, { ...data, width: 101 }, { ...data, width: 0 }, { ...data, caption: {} }, { ...data, alt: "x".repeat(256) }, { ...data, caption: "x".repeat(501) }]) {
    const source = serializeDocumentImage(bad as typeof data);
    assert.equal(parseDocumentImage(source), null);
    assert.equal(parseSegments(source)[0].type, "text");
  }
  assert.equal(parseDocumentImage("::image[%invalid]::"), null);
});
test("insertion replaces selected text with standalone image blocks", () => {
  const result = insertImageBlocks("Before selected After", 7, 15, [data]);
  assert.equal(result, `Before \n${serializeDocumentImage(data)}\n After`);
  assert.equal(parseSegments(result).filter(segment => segment.type === "image").length, 1);
  assert.equal(insertImageBlocks("unchanged", 0, 9, []), "unchanged");
});
test("multiple images retain their order", () => {
  const second = { ...data, id: "ae4fa050-31a0-4c4c-a7bb-b5eedc34bb0d" };
  const result = insertImageBlocks("", 0, 0, [data, second]);
  assert.deepEqual(parseSegments(result).filter(segment => segment.type === "image").map(segment => segment.data.id), [data.id, second.id]);
});
test("image endpoints are always scoped to the current document", () => {
  assert.equal(imageEndpoint(12, data.id), `/api/documents/12/images/${data.id}`);
  assert.throws(() => imageEndpoint(0, data.id));
  assert.throws(() => imageEndpoint(12, "https://other.example/image.png"));
});
