import { isWebUrl, parseWebLink, serializeWebLink, type WebLink } from "./webLinks.ts";

import { parseDocumentImage, type DocumentImageBlock } from "./documentImages.ts";

export type TextSegment = { type: "text"; content: string };
export type SchedulerSegment = { type: "scheduler"; id: number };
/** Sub-page block, stored as `::page[id]::`. */
export type PageSegment = { type: "page"; id: number };
export type CodeSegment = {
  type: "code";
  content: string;
  language: string;
  opening: string;
  closing: string;
};
export type LinkSegment = { type: "link"; data: WebLink; source: string };
export type ImageSegment = { type: "image"; data: DocumentImageBlock; source: string };
export type Segment = TextSegment | SchedulerSegment | PageSegment | CodeSegment | LinkSegment | ImageSegment;

function parseText(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /::scheduler\[(\d+)\]::|::page\[(\d+)\]::|^::(?:link|image)\[[^\r\n]*?\]::(?=\r?$)/gm;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) segments.push({ type: "text", content: text.slice(last, match.index) });
    const block = match[1] || match[2];
    const data = block ? null : parseWebLink(match[0]);
    const image = block ? null : parseDocumentImage(match[0]);
    if (match[1]) segments.push({ type: "scheduler", id: Number(match[1]) });
    else if (match[2]) segments.push({ type: "page", id: Number(match[2]) });
    else if (data) segments.push({ type: "link", data, source: match[0] });
    else if (image) segments.push({ type: "image", data: image, source: match[0] });
    else segments.push({ type: "text", content: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", content: text.slice(last) });
  return segments;
}

// Only complete top-level fences become editable blocks. Preserve their exact
// Markdown and never interpret scheduler markers inside code as live blocks.
export function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const openingPattern = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n)/gm;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = openingPattern.exec(text))) {
    const fence = match[1];
    if (fence[0] === "`" && match[2].includes("`")) continue;
    const contentStart = match.index + match[0].length;
    const closingPattern = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*(?:\\r?\\n|$)`, "gm");
    closingPattern.lastIndex = contentStart;
    const closing = closingPattern.exec(text);
    if (!closing) break;
    segments.push(...parseText(text.slice(last, match.index)));
    segments.push({
      type: "code",
      content: text.slice(contentStart, closing.index),
      language: match[2].trim().split(/\s+/)[0] || "",
      opening: match[0],
      closing: closing[0],
    });
    last = closing.index + closing[0].length;
    openingPattern.lastIndex = last;
  }
  segments.push(...parseText(text.slice(last)));
  return segments.length ? segments : [{ type: "text", content: text }];
}

export function normalizeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    if (segment.type !== "text" && (!out.length || out.at(-1)?.type !== "text")) {
      out.push({ type: "text", content: "" });
    }
    out.push(segment);
  }
  if (!out.length || out.at(-1)?.type !== "text") out.push({ type: "text", content: "" });
  return out;
}

function segmentToText(segment: Segment): string {
  if (segment.type === "text") return segment.content;
  if (segment.type === "scheduler") return `::scheduler[${segment.id}]::`;
  if (segment.type === "page") return `::page[${segment.id}]::`;
  if (segment.type === "link" || segment.type === "image") return segment.source;
  return segment.opening + segment.content + segment.closing;
}

/** Blocks the parser only recognises on a line of their own. */
const LINE_BLOCKS = new Set<Segment["type"]>(["code", "link", "image"]);

/**
 * Text typed right before or after a line block must stay off the block's lines,
 * otherwise the block is read back as plain text (typing "t" above a fence gave
 * "t```ts"). Returns `content` with the missing line breaks added.
 */
export function keepBlocksOnOwnLine(content: string, previous?: Segment, next?: Segment): string {
  if (!content) return content;
  let result = content;
  if (previous && LINE_BLOCKS.has(previous.type) && !segmentToText(previous).endsWith("\n") && !result.startsWith("\n")) result = "\n" + result;
  if (next && LINE_BLOCKS.has(next.type) && !result.endsWith("\n")) result += "\n";
  return result;
}

export function segmentsToText(segments: Segment[]): string {
  // Safety net for programmatic edits; the editor already fixes text as it is typed.
  return segments
    .map((segment, i) => (segment.type === "text" ? keepBlocksOnOwnLine(segment.content, segments[i - 1], segments[i + 1]) : segmentToText(segment)))
    .join("");
}

export function segmentGlobalOffset(segments: Segment[], upTo: number): number {
  return segments.slice(0, upTo).reduce((offset, segment) => offset + segmentToText(segment).length, 0);
}

export function codeValue(segment: CodeSegment): string {
  return segment.content.replace(/\r?\n$/, "");
}

export function updateCodeSegment(segment: CodeSegment, value: string, language: string): CodeSegment {
  const opening = segment.opening.match(/^( {0,3})(`{3,}|~{3,})/)!;
  const character = opening[2][0];
  // Lengthen the fence if the snippet itself contains a closing fence line.
  const embeddedFences = [...value.matchAll(new RegExp(`^ {0,3}(${character}{3,})[ \\t]*$`, "gm"))];
  const length = Math.max(opening[2].length, ...embeddedFences.map(match => match[1].length + 1));
  const fence = character.repeat(length);
  const newline = segment.opening.endsWith("\r\n") ? "\r\n" : "\n";
  return {
    ...segment,
    language,
    content: value ? value + newline : "",
    opening: opening[1] + fence + language + newline,
    closing: fence + (segment.closing.endsWith("\n") ? newline : ""),
  };
}

// Called when text editing ends, never while the user is typing a URL.
export function convertStandaloneLinks(text: string): { text: string; ids: string[] } {
  const ids: string[] = [];
  const original = parseSegments(text);
  const segments = original.map((segment, index) => {
    if (segment.type !== "text") return segment;
    const incompleteFence = segment.content.search(/^ {0,3}(`{3,}|~{3,})/m);
    const head = incompleteFence === -1 ? segment.content : segment.content.slice(0, incompleteFence);
    const tail = incompleteFence === -1 ? "" : segment.content.slice(incompleteFence);
    const content = head.replace(/^[ \t]*(https?:\/\/[^\s<>]+)[ \t]*(?=\r?$)/gm, (line, url: string) => {
      if (!isWebUrl(url)) return line;
      const id = crypto.randomUUID();
      ids.push(id);
      return serializeWebLink({ id, url, mode: "url" });
    });
    let result = content + tail;
    if (result.startsWith("::link[") && index > 0 && !segmentsToText(original.slice(0, index)).endsWith("\n")) result = "\n" + result;
    if (result.endsWith("]::") && index < original.length - 1 && !segmentsToText(original.slice(index + 1)).startsWith("\n")) result += "\n";
    return { ...segment, content: result };
  });
  return { text: segmentsToText(segments), ids };
}
