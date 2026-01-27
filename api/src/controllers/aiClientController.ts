import { NextFunction, Request, Response } from "express";
import { getAnthropicModels, getResponse } from "../config/anthropicClient";

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { model_id, message } = req.body;

    const response = await getResponse(model_id, message);

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
