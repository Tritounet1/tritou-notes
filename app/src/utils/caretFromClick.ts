// Maps a click on rendered Markdown back to an offset in the Markdown source, so
// switching a text block to its editor puts the caret where the user clicked.

const SNIPPET = 32;

const countOccurrences = (haystack: string, needle: string) => {
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) count++;
  return count;
};

const nthIndexOf = (haystack: string, needle: string, n: number) => {
  let at = -1;
  for (let i = 0; i < n; i++) {
    at = haystack.indexOf(needle, at + 1);
    if (at < 0) return -1;
  }
  return at;
};

/**
 * Text right around the caret is usually copied verbatim from the source (Markdown
 * syntax lives around it, not inside a text node). Find that snippet in the source,
 * taking repeats into account: if it appears k times in the rendered text up to the
 * caret, the caret sits after its k-th occurrence in the source.
 *
 * @param renderedBefore rendered text of the block from its start up to the caret
 * @param nodeBefore / nodeAfter text of the clicked text node before / after the caret
 */
export function mapRenderedOffset(source: string, renderedBefore: string, nodeBefore: string, nodeAfter: string): number | null {
  for (const size of [SNIPPET, 12, 4]) {
    const before = nodeBefore.slice(-size);
    if (before.trim()) {
      const at = nthIndexOf(source, before, Math.max(1, countOccurrences(renderedBefore, before)));
      if (at >= 0) return at + before.length;
    }
    const after = nodeAfter.slice(0, size);
    if (after.trim()) {
      const at = nthIndexOf(source, after, countOccurrences(renderedBefore, after) + 1);
      if (at >= 0) return at;
    }
  }
  return null;
}

/** Source offset for a click at (x, y) inside `container`, or null when it can't be placed. */
export function sourceOffsetFromPoint(container: HTMLElement, x: number, y: number, source: string): number | null {
  const doc = container.ownerDocument;
  let node: Node | null = null;
  let offset = 0;
  // caretPositionFromPoint is standard; caretRangeFromPoint is the WebKit/Blink fallback.
  const position = (doc as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint?.(x, y);
  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !container.contains(node)) return null;

  const range = doc.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  const data = node.textContent ?? "";
  return mapRenderedOffset(source, range.toString(), data.slice(0, offset), data.slice(offset));
}

/** Pixel offset of `position` from the top of a textarea's content (mirror-element technique). */
export function caretTop(textarea: HTMLTextAreaElement, position: number): number {
  const mirror = textarea.ownerDocument.createElement("div");
  const style = getComputedStyle(textarea);
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderTopWidth", "boxSizing", "tabSize"] as const) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", overflowWrap: "break-word", width: `${textarea.clientWidth}px`, top: "0", left: "-9999px" });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = textarea.ownerDocument.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);
  textarea.ownerDocument.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

/** Nearest ancestor that scrolls vertically, or the page itself. */
export function scrollParent(element: HTMLElement): HTMLElement | Window {
  for (let el = element.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return window;
}
