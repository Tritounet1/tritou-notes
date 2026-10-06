import { prisma } from "../config/prismaClient";
import { removeDocumentImages } from "../utils/documentImageStorage";
import { descendantIds } from "../utils/documentTree";

/** Deletes a page with all its sub-pages, their histories and their image files. */
export const deleteDocumentTree = async (id: number) => {
  // Sub-pages go with their parent (DB cascade); their histories must go first.
  const subtree = [id, ...(await descendantIds(id))];
  await prisma.documentHistory.deleteMany({ where: { documentId: { in: subtree } } });
  const deleted = await prisma.document.delete({ where: { id } });
  // Metadata is removed by the cascading DocumentImage relation.
  await Promise.all(subtree.map((pageId) =>
    removeDocumentImages(pageId).catch((error) => console.error("Image cleanup failed for document", pageId, error)),
  ));
  return { deleted, subtree };
};
