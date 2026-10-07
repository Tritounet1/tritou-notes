import { NextFunction, Request, Response } from "express";
import { toHttpError } from "../utils/httpError";

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // Express recognises error handlers by their four parameters.
  next: NextFunction,
) => {
  const { status, message } = toHttpError(err);
  // The details stay in the logs, never in the response.
  if (status >= 500) console.error(err);
  res.status(status).json({ message });
};
