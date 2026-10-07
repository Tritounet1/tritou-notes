import type { ContentPart } from "./openrouter";
import { httpError } from "../utils/httpError";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 200_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|rb|go|rs|java|c|cpp|h|sh|ya?ml|toml|ini|sql|log)$/i;

export interface Attachment {
  name: string;
  /** Data URL produced by FileReader.readAsDataURL. */
  data: string;
}

/**
 * Turns uploaded files into chat content parts: images and PDFs are passed to the
 * model as-is, text files are inlined. Anything else is rejected.
 */
export const attachmentToPart = ({ name, data }: Attachment): ContentPart => {
  if (typeof name !== "string") throw httpError("Pièce jointe sans nom valide.");
  const match = /^data:([^;,]*)(?:;[^,]*)?;base64,(.*)$/s.exec(data ?? "");
  if (!match) throw httpError(`Fichier illisible : ${name}`);
  const [, mime, base64] = match;
  const size = Buffer.byteLength(base64, "base64");
  if (size > MAX_ATTACHMENT_BYTES) throw httpError(`${name} dépasse 10 Mo.`, 413);
  if (IMAGE_TYPES.includes(mime)) return { type: "image_url", image_url: { url: data } };
  if (mime === "application/pdf") return { type: "file", file: { filename: name, file_data: data } };
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXTENSIONS.test(name)) {
    const text = Buffer.from(base64, "base64").toString("utf8").slice(0, MAX_TEXT_CHARS);
    return { type: "text", text: `<fichier nom="${name.replace(/"/g, "'")}">\n${text}\n</fichier>` };
  }
  throw httpError(`Type de fichier non pris en charge : ${name} (images, PDF ou fichiers texte).`, 415);
};
