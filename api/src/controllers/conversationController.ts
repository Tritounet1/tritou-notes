import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const createConversation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { message, response, model_id, document_id } = req.body;
    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }
    const conversation = await prisma.conversation.create({
      data: {
        message: message,
        response: response,
        model_id: model_id,
        author: {
          connect: { id: author.id },
        },
        document: {
          connect: { id: document_id },
        },
      },
    });
    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

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
