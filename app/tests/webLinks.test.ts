import assert from "node:assert/strict";
import { test } from "node:test";
import { insertPastedWebLink, isWebUrl, parseWebLink, serializeWebLink, webUrlOnLine, youtubeVideo } from "../src/utils/webLinks.ts";
import { convertStandaloneLinks, normalizeSegments, parseSegments, segmentsToText } from "../src/utils/documentSegments.ts";

test("web URLs reject scripts, credentials and invalid input", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,hi", "https://user:pass@example.com", "not a link"]) assert.equal(isWebUrl(value), false);
  assert.equal(isWebUrl("https://example.com/a?q=hello#title"), true);
});

test("standalone paste offers a chooser but inline links remain text", () => {
  assert.equal(insertPastedWebLink("Lien : ", 7, 7, "https://example.com"), null);
  assert.equal(insertPastedWebLink(" du texte", 0, 0, "https://example.com"), null);
  const result = insertPastedWebLink("Avant\n\nAprès", 6, 6, "https://example.com");
  assert.ok(result);
  assert.equal(result.text, `Avant\n${serializeWebLink(result.data)}\nAprès`);
  assert.equal(result.data.url, "https://example.com");
  assert.equal(webUrlOnLine("Texte\nhttps://example.com\nSuite", 20), "https://example.com");
  assert.equal(webUrlOnLine("Texte https://example.com", 20), null);
});

test("display choices and metadata survive document reloading", () => {
  for (const mode of ["url", "preview", "embed"] as const) {
    const data = { id: "link-1", mode, url: "https://example.com?a=1&b=2", title: "Titre [é]", description: "Contenu\navec caractères", image: "https://example.com/photo.jpg" };
    const text = `Avant\n${serializeWebLink(data)}\nAprès`;
    const segments = normalizeSegments(parseSegments(text));
    const link = segments.find(segment => segment.type === "link");
    assert.ok(link && link.type === "link");
    assert.deepEqual(link.data, data);
    assert.equal(segmentsToText(segments), text);
  }
});

test("converting plain URLs preserves other links and literal code", () => {
  const source = "Avant\nhttps://example.com\nUn lien https://example.org\n```text\nhttps://example.net\n```\nAprès";
  const converted = convertStandaloneLinks(source);
  assert.equal(converted.ids.length, 1);
  assert.ok(converted.text.includes("Un lien https://example.org"));
  assert.ok(converted.text.includes("```text\nhttps://example.net\n```"));
  assert.equal(convertStandaloneLinks(converted.text).ids.length, 0);
});

test("invalid serialized links remain literal and cannot add unsafe image URLs", () => {
  const malformed = "::link[invalid]::";
  assert.equal(segmentsToText(parseSegments(malformed)), malformed);
  assert.equal(parseWebLink(serializeWebLink({ id: "1", url: "javascript:alert(1)", mode: "embed" })), null);
  const link = parseWebLink(serializeWebLink({ id: "1", url: "https://example.com", mode: "preview", image: "javascript:alert(1)" }));
  assert.equal(link?.image, undefined);
});

test("YouTube watch, short, shorts and embed URLs use the same safe player", () => {
  for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://youtube.com/embed/dQw4w9WgXcQ"]) {
    assert.equal(youtubeVideo(url)?.embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  }
  assert.equal(youtubeVideo("https://youtu.be/dQw4w9WgXcQ?t=1m30s")?.embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90");
  assert.equal(youtubeVideo("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideo("https://youtu.be/invalid"), null);
});

test("unclosed fences stay literal and links beside scheduler blocks remain parseable", () => {
  const unclosed = "```text\nhttps://example.com";
  assert.equal(convertStandaloneLinks(unclosed).text, unclosed);
  const converted = convertStandaloneLinks("::scheduler[1]::https://example.com::scheduler[2]::");
  assert.equal(converted.ids.length, 1);
  assert.equal(parseSegments(converted.text).filter(segment => segment.type === "link").length, 1);
});
