import { NextFunction, Request, Response } from "express";
import { getAnthropicModels, getResponse } from "../config/anthropicClient";
import { prisma } from "../config/prismaClient";

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { model_id, message, document_id } = req.body;

    const response = await getResponse(model_id, message);

    if (response) {
      const answer =
        response.find((b) => b.type === "text")?.text ?? "Pas de réponse";

      await prisma.conversation.create({
        data: {
          message: message,
          response: answer,
          model_id: model_id,
          documentId: document_id,
          authorId: req.user.id,
        },
      });
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getModels = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const models = await getAnthropicModels();
    res.json(models);
  } catch (error) {
    next(error);
  }
};
