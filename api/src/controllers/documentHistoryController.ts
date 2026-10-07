import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { MAX_VERSIONS } from "../utils/documentRevision";

export const getDocumentHistoriesByDocumentId = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Latest versions, returned oldest first (the history view diffs each one with the previous).
    const documentHistories = await prisma.documentHistory.findMany({
      where: { documentId: id },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: MAX_VERSIONS,
    });
    res.json(documentHistories.reverse());
  } catch (error) {
    next(error);
  }
};
