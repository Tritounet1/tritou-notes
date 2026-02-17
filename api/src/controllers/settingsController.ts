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

    const settings = await prisma.settings.update({
      where: {
        id: id,
      },
      data: {
        anthropicApiKey: encrypt(anthropicApiKey),
        smtpUser: encrypt(smtpUser),
        smtpPassword: encrypt(smtpPassword),
        smtpHost: encrypt(smtpHost),
        smtpPort: parseInt(encrypt(smtpPort.toString())),
      },
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
