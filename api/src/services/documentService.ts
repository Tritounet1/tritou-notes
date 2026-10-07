import { prisma } from "../config/prismaClient";
import { removeDocumentImages } from "../utils/documentImageStorage";
import { descendantIds } from "../utils/documentTree";

/** Deletes a page with all its sub-pages, their histories and their image files. */
export const deleteDocumentTree = async (id: number) => {
  const subtree = [id, ...(await descendantIds(id))];
  // One statement: sub-pages, histories and image metadata go with it (DB cascades).
  const deleted = await prisma.document.delete({ where: { id } });
  await Promise.all(subtree.map((pageId) =>
    removeDocumentImages(pageId).catch((error) => console.error("Image cleanup failed for document", pageId, error)),
  ));
  return { deleted, subtree };
};
