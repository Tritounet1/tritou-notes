export type TextSegment = { type: "text"; content: string };
export type SchedulerSegment = { type: "scheduler"; id: number };
export type CodeSegment = {
  type: "code";
  content: string;
  language: string;
  opening: string;
  closing: string;
};
export type Segment = TextSegment | SchedulerSegment | CodeSegment;

function parseText(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /::scheduler\[(\d+)\]::/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) segments.push({ type: "text", content: text.slice(last, match.index) });
    segments.push({ type: "scheduler", id: Number(match[1]) });
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
  return segment.opening + segment.content + segment.closing;
}

export function segmentsToText(segments: Segment[]): string {
  return segments.map(segmentToText).join("");
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
