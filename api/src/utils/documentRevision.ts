import { prisma } from "../config/prismaClient";
import type { Prisma } from "../generated/prisma/client";
import { InvalidParentError, resolveParent } from "./documentTree";
import { resolveFolder } from "./folderTree";
import { notFound } from "./httpError";

export interface DocumentChanges {
  title?: string;
  text?: string;
  public?: boolean;
  /** Moves the page under another page; null = root. Validated against cycles. */
  parentId?: unknown;
  /** Moves the page into a folder (null = no folder). Only root pages live in folders. */
  folderId?: unknown;
}

/** Editor saves of one author closer than this are grouped into a single version. */
export const MERGE_WINDOW_MS = 10 * 60 * 1000;
/** Versions kept per page; older ones are deleted. */
export const MAX_VERSIONS = 200;

/** The page changed since the caller read it (optimistic concurrency control). */
export class DocumentConflictError extends Error {
  status = 409;
  constructor() {
    super("La page a été modifiée entre-temps (autre onglet, autre utilisateur ou assistant).");
  }
}

export interface RevisionOptions {
  /** `last_update` the caller based its changes on; the write is refused if the page changed since. */
  expectedLastUpdate?: Date;
  /**
   * Autosave from the editor: reuse the latest version when the same author saved it less
   * than MERGE_WINDOW_MS ago, so a typing session yields one version instead of one per pause.
   */
  mergeRecent?: boolean;
}

/**
 * Saves the current version to DocumentHistory when the title, text or visibility changes,
 * then applies `changes`. Shared by the editor (PUT /api/documents/:id) and the AI tools:
 * AI edits always get their own version, so each one can be undone from the page history.
 */
export const reviseDocument = async (id: number, authorId: number, changes: DocumentChanges, { mergeRecent = false, expectedLastUpdate }: RevisionOptions = {}) => {
  const previous_document = await prisma.document.findFirst({
    where: { id: id },
  });

  if (!previous_document) {
    throw notFound("Le document n'existe pas");
  }
  if (expectedLastUpdate && previous_document.last_update.getTime() !== expectedLastUpdate.getTime()) {
    throw new DocumentConflictError();
  }

  const author = await prisma.user.findFirst({ where: { id: authorId } });

  if (!author) {
    throw new Error("Utilisateur introuvable");
  }

  // `parentId` is only sent when moving the page (null = back to the root).
  const parent = changes.parentId === undefined ? undefined : await resolveParent(changes.parentId, id);
  const folder = changes.folderId === undefined ? undefined : await resolveFolder(changes.folderId);
  if (parent != null && folder != null) throw new InvalidParentError("Une sous-page ne peut pas être dans un dossier");

  try {
    // The version and the update are written together: a refused update leaves no version behind.
    return await prisma.$transaction(async (tx) => {
      const contentChanged =
        (changes.title !== undefined && changes.title !== previous_document.title) ||
        (changes.text !== undefined && changes.text !== previous_document.text) ||
        (changes.public !== undefined && changes.public !== previous_document.public);
      if (contentChanged && !(mergeRecent && (await recentVersionBy(tx, id, author.id)))) {
        await tx.documentHistory.create({
          data: {
            title: previous_document.title,
            text: previous_document.text,
            public: previous_document.public,
            document: { connect: { id } },
            author: { connect: { id: author.id } },
          },
        });
        await pruneVersions(tx, id);
      }

      return tx.document.update({
        // With expectedLastUpdate, a concurrent write makes this match nothing (P2025).
        where: { id, ...(expectedLastUpdate && { last_update: expectedLastUpdate }) },
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
    });
  } catch (error) {
    if (expectedLastUpdate && (error as { code?: string }).code === "P2025") throw new DocumentConflictError();
    throw error;
  }
};

type Tx = Prisma.TransactionClient;

const recentVersionBy = async (tx: Tx, documentId: number, authorId: number) => {
  const latest = await tx.documentHistory.findFirst({ where: { documentId }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
  return latest !== null && latest.authorId === authorId && Date.now() - latest.created_at.getTime() < MERGE_WINDOW_MS;
};

const pruneVersions = async (tx: Tx, documentId: number) => {
  const stale = await tx.documentHistory.findMany({
    where: { documentId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    skip: MAX_VERSIONS,
    select: { id: true },
  });
  if (stale.length > 0) await tx.documentHistory.deleteMany({ where: { id: { in: stale.map(({ id }) => id) } } });
};
