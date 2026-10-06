import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const root = () => resolve(process.env.IMAGE_STORAGE_PATH || "./uploads/images");
const failure = (message: string, status = 415) => Object.assign(new Error(message), { status });

function documentDirectory(documentId: number) {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) throw new Error("Invalid document ID");
  return join(root(), String(documentId));
}
export function imagePath(documentId: number, imageId: string) {
  if (!IMAGE_ID_PATTERN.test(imageId)) throw new Error("Invalid image ID");
  return join(documentDirectory(documentId), `${imageId}.webp`);
}

export async function prepareImage(input: Buffer) {
  if (!input.length || input.length > MAX_IMAGE_SIZE) throw failure("L’image doit faire entre 1 octet et 10 Mo.", 413);
  // Check raster signatures before asking a decoder to inspect untrusted input.
  const raster = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    input.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    ["GIF87a", "GIF89a"].includes(input.subarray(0, 6).toString("ascii")) ||
    (input.subarray(0, 4).toString("ascii") === "RIFF" && input.subarray(8, 12).toString("ascii") === "WEBP");
  if (!raster) throw failure("Formats acceptés : JPEG, PNG, WebP et GIF. Les SVG ne sont pas acceptés.");
  try {
    const pipeline = sharp(input, { animated: true, limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await pipeline.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages || 1) > 100) throw new Error("Invalid dimensions");
    if (!metadata.pages || metadata.pages === 1) pipeline.rotate();
    // Re-encode pixels to strip metadata and any bytes appended to the uploaded file.
    const { data, info } = await pipeline.resize({ width: 4096, height: 4096, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_IMAGE_SIZE) throw failure("L’image traitée dépasse 10 Mo.", 413);
    return { data, width: info.width, height: info.pageHeight || info.height, mimeType: "image/webp" };
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    throw failure("Image invalide, trop volumineuse en pixels ou endommagée.");
  }
}
export async function storeImage(documentId: number, imageId: string, data: Buffer) {
  const path = imagePath(documentId, imageId);
  await mkdir(documentDirectory(documentId), { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, data, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") await rm(path, { force: true });
    throw error;
  }
}
export async function removeImage(documentId: number, imageId: string) {
  await rm(imagePath(documentId, imageId), { force: true });
}
export async function removeDocumentImages(documentId: number) {
  await rm(documentDirectory(documentId), { recursive: true, force: true });
}
