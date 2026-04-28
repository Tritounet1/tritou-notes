import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const conversations = await prisma.conversation.findMany();
    res.json(conversations);
  } catch (error) {
    next(error);
  }
};

export const getConversationsByDocumentId = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const conversations = await prisma.conversation.findMany({
      where: {
        documentId: id,
      },
    });
    if (!conversations) {
      res.status(404).json({ message: "Conversations not found" });
      return;
    }
    res.json(conversations);
  } catch (error) {
    next(error);
  }
};

export const deleteConversationsByDocumentId = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedConversations = await prisma.conversation.deleteMany({
      where: {
        documentId: id,
      },
    });
    res.json(deletedConversations);
  } catch (error) {
    next(error);
  }
};
