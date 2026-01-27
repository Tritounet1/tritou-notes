import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { title } = req.body;
    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }
    const document = await prisma.document.create({
      data: {
        title: title,
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
    res.json(document);
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
    const { title, text, is_public } = req.body;

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
    await prisma.documentHistory.deleteMany({
      where: {
        documentId: id,
      },
    });
    const deletedDocument = await prisma.document.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedDocument);
  } catch (error) {
    next(error);
  }
};
