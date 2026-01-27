import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const getDocumentsHistories = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const documentHistories = await prisma.documentHistory.findMany();
    res.json(documentHistories);
  } catch (error) {
    next(error);
  }
};

export const getDocumentHistoriesByDocumentId = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const documentHistories = await prisma.documentHistory.findMany({
      where: {
        documentId: id,
      },
    });
    if (!documentHistories) {
      res.status(404).json({ message: "DocumentHistories not found" });
      return;
    }
    res.json(documentHistories);
  } catch (error) {
    next(error);
  }
};
