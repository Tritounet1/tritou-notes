import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { encrypt } from "../utils/utils";

export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await prisma.settings.findMany();
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { anthropicApiKey, smtpUser, smtpPassword, smtpHost, smtpPort } =
      req.body;

    const data: Record<string, string | number | null | undefined> = {};

    if (anthropicApiKey !== undefined) data.anthropicApiKey = anthropicApiKey ? encrypt(anthropicApiKey) : null;
    if (smtpUser !== undefined) data.smtpUser = smtpUser ? encrypt(smtpUser) : null;
    if (smtpPassword !== undefined) data.smtpPassword = smtpPassword ? encrypt(smtpPassword) : null;
    if (smtpHost !== undefined) data.smtpHost = smtpHost ? encrypt(smtpHost) : null;
    if (smtpPort !== undefined) data.smtpPort = smtpPort || null;

    const settings = await prisma.settings.update({
      where: { id },
      data,
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
