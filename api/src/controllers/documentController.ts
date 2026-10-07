import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { deleteDocumentTree } from "../services/documentService";
import { ancestorsOf, resolveParent } from "../utils/documentTree";
import { DocumentConflictError, reviseDocument } from "../utils/documentRevision";
import { folderChain, resolveFolder } from "../utils/folderTree";

export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { title, type, parentId, folderId } = req.body;
    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }
    const parent = parentId === undefined ? null : await resolveParent(parentId);
    // Sub-pages live under their parent page, never directly in a folder.
    const folder = parent === null && folderId !== undefined ? await resolveFolder(folderId) : null;
    const document = await prisma.document.create({
      data: {
        title: title,
        type: type,
        ...(parent !== null && { parent: { connect: { id: parent } } }),
        ...(folder !== null && { folder: { connect: { id: folder } } }),
        author: {
          connect: { id: author.id },
        },
      },
    });
    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const documents = await prisma.document.findMany();
    res.json(documents);
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const document = await prisma.document.findUnique({
      where: {
        id: id,
      },
    });
    if (!document) {
      res.status(404).json({ message: "Document not found" });
      return;
    }
    // Signed-out readers of a public page only see the public parts of its tree.
    const visible = (page: { public: boolean }) => Boolean(req.user) || page.public;
    const [ancestors, children] = await Promise.all([
      ancestorsOf(document.parentId),
      prisma.document.findMany({
        where: { parentId: id },
        select: { id: true, title: true, type: true, public: true },
        orderBy: { created_at: "asc" },
      }),
    ]);
    // Folder path of the page's top-level ancestor (folders hold root pages only), for the breadcrumb.
    const rootFolderId = ancestors.length
      ? (await prisma.document.findUnique({ where: { id: ancestors[0].id }, select: { folderId: true } }))?.folderId ?? null
      : document.folderId;
    res.json({
      ...document,
      folders: req.user ? await folderChain(rootFolderId) : [],
      ancestors: ancestors.filter(visible).map(({ id, title }) => ({ id, title })),
      children: children.filter(visible).map(({ id, title, type }) => ({ id, title, type })),
    });
  } catch (error) {
    next(error);
  }
};

export const updateDocument = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, text, is_public, parentId, folderId, expectedLastUpdate } = req.body;
    const expected = expectedLastUpdate === undefined ? undefined : new Date(expectedLastUpdate);
    if (expected && Number.isNaN(expected.getTime())) {
      res.status(400).json({ message: "expectedLastUpdate invalide" });
      return;
    }
    const document = await reviseDocument(id, req.user.id, { title, text, public: is_public, parentId, folderId }, { mergeRecent: true, expectedLastUpdate: expected });
    res.json(document);
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      // The editor shows the saved version so the user can choose which one to keep.
      const current = await prisma.document.findUnique({ where: { id: parseInt(req.params.id, 10) } }).catch(() => null);
      res.status(409).json({ message: error.message, document: current });
      return;
    }
    next(error);
  }
};

export const deleteDocument = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { deleted: deletedDocument } = await deleteDocumentTree(id);
    res.json(deletedDocument);
  } catch (error) {
    next(error);
  }
};
