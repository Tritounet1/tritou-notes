import { prisma } from "../config/prismaClient";
import { InvalidParentError, resolveParent } from "./documentTree";
import { resolveFolder } from "./folderTree";

export interface DocumentChanges {
  title?: string;
  text?: string;
  public?: boolean;
  /** Moves the page under another page; null = root. Validated against cycles. */
  parentId?: unknown;
  /** Moves the page into a folder (null = no folder). Only root pages live in folders. */
  folderId?: unknown;
}

/**
 * Saves the current version to DocumentHistory, then applies `changes`.
 * Shared by the editor (PUT /api/documents/:id) and the AI tools, so every
 * AI edit can be undone from the page history.
 */
export const reviseDocument = async (id: number, authorId: number, changes: DocumentChanges) => {
  const previous_document = await prisma.document.findFirst({
    where: { id: id },
  });

  if (!previous_document) {
    throw new Error("Le document n'existe pas");
  }

  const author = await prisma.user.findFirst({ where: { id: authorId } });

  if (!author) {
    throw new Error("Utilisateur introuvable");
  }

  // `parentId` is only sent when moving the page (null = back to the root).
  const parent = changes.parentId === undefined ? undefined : await resolveParent(changes.parentId, id);
  const folder = changes.folderId === undefined ? undefined : await resolveFolder(changes.folderId);
  if (parent != null && folder != null) throw new InvalidParentError("Une sous-page ne peut pas être dans un dossier");

  await prisma.documentHistory.create({
    data: {
      title: previous_document.title,
      text: previous_document.text,
      public: previous_document.public,
      document: {
        connect: {
          id: id,
        },
      },
      author: {
        connect: {
          id: author.id,
        },
      },
    },
  });

  return prisma.document.update({
    where: {
      id: id,
    },
    data: {
      title: changes.title,
      text: changes.text,
      author: {
        connect: { id: author.id },
      },
      public: changes.public,
      ...(parent !== undefined && {
        parent: parent === null ? { disconnect: true } : { connect: { id: parent } },
      }),
      // A page goes either under a page or into a folder: placing it in one leaves the other.
      ...(folder !== undefined
        ? { folder: folder === null ? { disconnect: true } : { connect: { id: folder } } }
        : parent != null && { folder: { disconnect: true } }),
      ...(folder != null && parent === undefined && { parent: { disconnect: true } }),
      last_update: new Date(),
    },
  });
};
