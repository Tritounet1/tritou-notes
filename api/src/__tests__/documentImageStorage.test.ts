import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imagePath, MAX_IMAGE_SIZE, prepareImage, removeDocumentImages, removeImage, storeImage } from "../utils/documentImageStorage";
const id = "fe4fa050-31a0-4c4c-a7bb-b5eedc34bb0d";
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "tritou-image-test-")); vi.stubEnv("IMAGE_STORAGE_PATH", directory); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { force: true, recursive: true }); });

async function raster(format: "png" | "jpeg" | "webp" | "gif") {
  return sharp({ create: { width: 8, height: 4, channels: 4, background: "red" } }).toFormat(format).toBuffer();
}
describe("raster validation and normalization", () => {
  it.each(["png", "jpeg", "webp", "gif"] as const)("decodes and re-encodes real %s pixels", async format => {
    const prepared = await prepareImage(await raster(format));
    expect(prepared).toMatchObject({ width: 8, height: 4, mimeType: "image/webp" });
    const metadata = await sharp(prepared.data).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
  });
  it.each([Buffer.alloc(0), Buffer.alloc(MAX_IMAGE_SIZE + 1)])("enforces input size limits %#", async bytes => {
    await expect(prepareImage(bytes)).rejects.toMatchObject({ status: 413 });
  });
  it.each(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "<html>fake image</html>", "not an image"])("rejects non-raster content %#", async input => {
    await expect(prepareImage(Buffer.from(input))).rejects.toMatchObject({ status: 415 });
  });
  it("rejects truncated PNGs with a valid signature", async () => {
    await expect(prepareImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).rejects.toMatchObject({ status: 415 });
  });
  it("applies EXIF orientation and removes EXIF metadata", async () => {
    const input = await sharp(await raster("jpeg")).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const prepared = await prepareImage(input);
    expect(prepared).toMatchObject({ width: 4, height: 8 });
    expect((await sharp(prepared.data).metadata()).exif).toBeUndefined();
  });
  it("preserves GIF animation when converting to WebP", async () => {
    const header = "47494638396101000100800000ff000000ff00";
    const loop = "21ff0b4e45545343415045322e300301000000";
    const frame = "21f904000a0000002c0000000001000100000202440100";
    const second = "21f904000a0000002c00000000010001000002024c0100";
    const prepared = await prepareImage(Buffer.from(header + loop + frame + second + "3b", "hex"));
    expect((await sharp(prepared.data, { animated: true }).metadata()).pages).toBe(2);
    expect(prepared).toMatchObject({ width: 1, height: 1 });
  });
  it("rejects excessively long animations before conversion", async () => {
    const header = "47494638396101000100800000ff000000ff00";
    const frame = "21f904000a0000002c0000000001000100000202440100";
    await expect(prepareImage(Buffer.from(header + frame.repeat(101) + "3b", "hex"))).rejects.toMatchObject({ status: 415 });
  });
  it("caps large dimensions without enlarging smaller images", async () => {
    const input = await sharp({ create: { width: 5000, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    expect((await prepareImage(input)).width).toBe(4096);
  });
});

describe("local file lifecycle", () => {
  it("writes private generated paths and removes individual files", async () => {
    await storeImage(12, id, Buffer.from("image"));
    expect(await readFile(imagePath(12, id), "utf8")).toBe("image");
    await expect(storeImage(12, id, Buffer.from("overwrite"))).rejects.toMatchObject({ code: "EEXIST" });
    await removeImage(12, id);
    await expect(readFile(imagePath(12, id))).rejects.toMatchObject({ code: "ENOENT" });
    await removeImage(12, id);
  });
  it("removes all files of one document while preserving others", async () => {
    await storeImage(12, id, Buffer.from("image")); await storeImage(13, id, Buffer.from("other"));
    await removeDocumentImages(12);
    expect(await readdir(directory)).toEqual(["13"]);
    expect(await readFile(imagePath(13, id), "utf8")).toBe("other");
    await removeDocumentImages(12);
  });
  it.each([0, -1, 1.5, NaN])("rejects invalid document paths %s", value => {
    expect(() => imagePath(value, id)).toThrow("document ID");
  });
  it("rejects traversal in image IDs", () => {
    expect(() => imagePath(12, "../../secret")).toThrow("image ID");
  });
});
