import assert from "node:assert/strict";
import { test } from "node:test";
import { codeValue, normalizeSegments, parseSegments, segmentGlobalOffset, segmentsToText, updateCodeSegment } from "../src/utils/documentSegments.ts";

const samples = [
  "", "Texte sans code", "Avant\n```js\nconst x = 1;\n```\nAprès",
  "```\n\n```", "~~~python\r\nprint(42)\r\n~~~\r\n",
  "````markdown\n```js\ncode\n```\n````\n", "```unknown title\nx\n```",
  "::scheduler[2]::\n```js\n::scheduler[9]::\n```\n::scheduler[3]::",
];

test("existing Markdown survives parsing and normalization byte for byte", () => {
  for (const source of samples) assert.equal(segmentsToText(normalizeSegments(parseSegments(source))), source);
});

test("scheduler markers inside code remain literal", () => {
  const segments = parseSegments(samples.at(-1)!);
  assert.deepEqual(segments.filter(s => s.type === "scheduler").map(s => s.id), [2, 3]);
});

test("language and content edits survive reloading without changing surrounding text", () => {
  const segments = parseSegments("Avant\n```\n\n```\nAprès");
  const index = segments.findIndex(s => s.type === "code");
  const code = segments[index];
  assert.equal(code.type, "code");
  if (code.type !== "code") return;
  segments[index] = updateCodeSegment(code, "print('bonjour')", "python");
  const result = segmentsToText(segments);
  assert.equal(result, "Avant\n```python\nprint('bonjour')\n```\nAprès");
  const reloaded = parseSegments(result).find(s => s.type === "code")!;
  assert.equal(reloaded.type, "code");
  if (reloaded.type === "code") assert.equal(codeValue(reloaded), "print('bonjour')");
});

test("embedded fences cannot terminate an edited block", () => {
  const code = parseSegments("```markdown\n\n```\n")[0];
  assert.equal(code.type, "code");
  if (code.type !== "code") return;
  const value = "```js\nconst x = 1;\n```";
  const reloaded = parseSegments(segmentsToText([updateCodeSegment(code, value, "markdown")]));
  assert.equal(reloaded.length, 1);
  if (reloaded[0].type === "code") assert.equal(codeValue(reloaded[0]), value);
});

test("incomplete fences remain editable as ordinary text", () => {
  assert.deepEqual(parseSegments("```python\nprint(42)"), [{ type: "text", content: "```python\nprint(42)" }]);
});

test("global offsets account for complete code blocks", () => {
  const source = "```js\nx\n```\n::scheduler[1]::";
  const segments = normalizeSegments(parseSegments(source));
  const index = segments.findIndex(s => s.type === "scheduler");
  assert.equal(segmentGlobalOffset(segments, index), source.indexOf("::scheduler"));
});
