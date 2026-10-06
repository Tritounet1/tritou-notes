import { prisma } from "../config/prismaClient";
import { resolveParent } from "./documentTree";

export interface DocumentChanges {
  title?: string;
  text?: string;
  public?: boolean;
  /** Moves the page; null = root. Validated against cycles. */
  parentId?: unknown;
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
      last_update: new Date(),
    },
  });
};
