import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { removeDocumentImages } from "../utils/documentImageStorage";
import { ancestorsOf, descendantIds, resolveParent } from "../utils/documentTree";

export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { title, type, parentId } = req.body;
    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }
    const parent = parentId === undefined ? null : await resolveParent(parentId);
    const document = await prisma.document.create({
      data: {
        title: title,
        type: type,
        ...(parent !== null && { parent: { connect: { id: parent } } }),
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
    res.json({
      ...document,
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
    const { title, text, is_public, parentId } = req.body;

    const previous_document = await prisma.document.findFirst({
      where: { id: id },
    });

    if (!previous_document) {
      throw new Error("Le document n'existe pas");
    }

    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }

    // `parentId` is only sent when moving the page (null = back to the root).
    const parent = parentId === undefined ? undefined : await resolveParent(parentId, id);

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

    const document = await prisma.document.update({
      where: {
        id: id,
      },
      data: {
        title: title,
        text: text,
        author: {
          connect: { id: author.id },
        },
        public: is_public,
        ...(parent !== undefined && {
          parent: parent === null ? { disconnect: true } : { connect: { id: parent } },
        }),
        last_update: new Date(),
      },
    });

    res.json(document);
  } catch (error) {
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
    // Sub-pages go with their parent (DB cascade); their histories must go first.
    const subtree = [id, ...(await descendantIds(id))];
    await prisma.documentHistory.deleteMany({
      where: {
        documentId: { in: subtree },
      },
    });
    const deletedDocument = await prisma.document.delete({
      where: {
        id: id,
      },
    });
    // Metadata is removed by the cascading DocumentImage relation.
    await Promise.all(subtree.map(pageId =>
      removeDocumentImages(pageId).catch(error => console.error("Image cleanup failed for document", pageId, error)),
    ));
    res.json(deletedDocument);
  } catch (error) {
    next(error);
  }
};
