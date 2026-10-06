export interface DocumentImageBlock {
  id: string;
  caption: string;
  alt: string;
  width: number;
}
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function serializeDocumentImage(image: DocumentImageBlock) {
  return `::image[${encodeURIComponent(JSON.stringify(image))}]::`;
}
export function parseDocumentImage(source: string): DocumentImageBlock | null {
  const match = /^::image\[(.*)\]::$/.exec(source);
  if (!match || match[1].length > 12000) return null;
  try {
    const value = JSON.parse(decodeURIComponent(match[1]));
    if (!value || typeof value.id !== "string" || !uuid.test(value.id) || typeof value.caption !== "string" || value.caption.length > 500 || typeof value.alt !== "string" || value.alt.length > 255 || typeof value.width !== "number" || !Number.isFinite(value.width) || value.width < 25 || value.width > 100) return null;
    return { id: value.id, caption: value.caption, alt: value.alt, width: value.width };
  } catch { return null; }
}
export function imageEndpoint(documentId: number, imageId: string) {
  if (!Number.isSafeInteger(documentId) || documentId <= 0 || !uuid.test(imageId)) throw new Error("Référence image invalide");
  return `/api/documents/${documentId}/images/${imageId}`;
}
export function insertImageBlocks(text: string, start: number, end: number, images: DocumentImageBlock[]) {
  if (!images.length) return text;
  const before = text.slice(0, start);
  const after = text.slice(end);
  return before + (before && !before.endsWith("\n") ? "\n" : "") + images.map(serializeDocumentImage).join("\n") + "\n" + after;
}
