import { prisma } from "../config/prismaClient";

/** Ids of every page below `id` (children, grandchildren…), breadth-first. */
export const descendantIds = async (id: number): Promise<number[]> => {
  const found: number[] = [];
  let frontier = [id];
  while (frontier.length) {
    // `found` + root guard against a corrupt cycle looping forever.
    const children = await prisma.document.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((child) => child.id).filter((childId) => childId !== id && !found.includes(childId));
    found.push(...frontier);
  }
  return found;
};

/** Parent chain of a page, root first. Stops on a missing parent or a (corrupt) cycle. */
export const ancestorsOf = async (
  parentId: number | null,
): Promise<{ id: number; title: string; public: boolean }[]> => {
  const chain: { id: number; title: string; public: boolean }[] = [];
  const visited = new Set<number>();
  let next = parentId;
  while (next !== null && !visited.has(next)) {
    visited.add(next);
    const parent = await prisma.document.findUnique({
      where: { id: next },
      select: { id: true, title: true, public: true, parentId: true },
    });
    if (!parent) break;
    chain.unshift({ id: parent.id, title: parent.title, public: parent.public });
    next = parent.parentId;
  }
  return chain;
};

/** Rejected parent choice; the error handler turns `status` into a 400. */
export class InvalidParentError extends Error {
  status = 400;
}

/**
 * Validates a requested parent for `documentId` (undefined when creating).
 * Returns the parent id to store, or null for a root page.
 */
export const resolveParent = async (rawParentId: unknown, documentId?: number): Promise<number | null> => {
  if (rawParentId === null) return null;
  const parentId = Number(rawParentId);
  if (!Number.isInteger(parentId)) throw new InvalidParentError("Page parente invalide");
  if (parentId === documentId) throw new InvalidParentError("Une page ne peut pas être sa propre parente");
  const parent = await prisma.document.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) throw new InvalidParentError("Page parente introuvable");
  if (documentId !== undefined && (await descendantIds(documentId)).includes(parentId)) {
    throw new InvalidParentError("Impossible de déplacer une page dans une de ses sous-pages");
  }
  return parentId;
};
