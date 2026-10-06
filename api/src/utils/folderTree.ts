import { prisma } from "../config/prismaClient";
import { InvalidParentError } from "./documentTree";

const folderId = (value: unknown) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new InvalidParentError("Dossier invalide");
  return id;
};

/** Validates a folder id for a page or a folder; null means "at the root". */
export const resolveFolder = async (raw: unknown): Promise<number | null> => {
  if (raw === null) return null;
  const id = folderId(raw);
  const folder = await prisma.folder.findUnique({ where: { id }, select: { id: true } });
  if (!folder) throw new InvalidParentError("Dossier introuvable");
  return id;
};

/** Ids of every folder below `id`, breadth-first. */
export const folderDescendantIds = async (id: number): Promise<number[]> => {
  const found: number[] = [];
  let frontier = [id];
  while (frontier.length) {
    const children = await prisma.folder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    // `found` and the root guard stop a corrupt cycle from looping forever.
    frontier = children.map((child) => child.id).filter((childId) => childId !== id && !found.includes(childId));
    found.push(...frontier);
  }
  return found;
};

/** Validates the new parent of folder `id`: no moving a folder into itself or its subfolders. */
export const resolveFolderParent = async (raw: unknown, id: number): Promise<number | null> => {
  const parent = await resolveFolder(raw);
  if (parent === id) throw new InvalidParentError("Un dossier ne peut pas être dans lui-même");
  if (parent !== null && (await folderDescendantIds(id)).includes(parent)) {
    throw new InvalidParentError("Impossible de déplacer un dossier dans un de ses sous-dossiers");
  }
  return parent;
};

/** Folder path of a folder, root first. */
export const folderChain = async (id: number | null): Promise<{ id: number; name: string }[]> => {
  const chain: { id: number; name: string }[] = [];
  const visited = new Set<number>();
  for (let next = id; next !== null && !visited.has(next); ) {
    visited.add(next);
    const folder = await prisma.folder.findUnique({ where: { id: next }, select: { id: true, name: true, parentId: true } });
    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    next = folder.parentId;
  }
  return chain;
};
