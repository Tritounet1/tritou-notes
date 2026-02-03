import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const updateUserPermissions = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      modifyScraper,
      useScraper,
      modifyScraperStatus,
      deleteScraper,
      createDocument,
      deleteDocument,
      modifyDocument,
      useAiChatBot,
      accessScrapersPage,
      accessInstancesScrapersPage,
    } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        id: req.body.user,
      },
    });

    if (user?.role !== "ADMIN") {
      res.json({
        message: "You don't have access to this route.",
      });
      return;
    }

    const userPermissions = await prisma.userPermissions.update({
      where: {
        id: id,
      },
      data: {
        modifyScraper: modifyScraper,
        useScraper: useScraper,
        modifyScraperStatus: modifyScraperStatus,
        deleteScraper: deleteScraper,
        createDocument: createDocument,
        deleteDocument: deleteDocument,
        modifyDocument: modifyDocument,
        useAiChatBot: useAiChatBot,
        accessScrapersPage: accessScrapersPage,
        accessInstancesScrapersPage: accessInstancesScrapersPage,
      },
    });

    res.json(userPermissions);
  } catch (error) {
    next(error);
  }
};
