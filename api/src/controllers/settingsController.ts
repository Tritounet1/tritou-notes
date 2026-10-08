import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { decrypt, encrypt } from "../utils/utils";

/** Plain value of an encrypted setting, or null if it cannot be read (e.g. ENCRYPTION_KEY changed). */
const readable = (value: unknown) => {
  if (typeof value !== "string" || !value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
};

// Never send secrets to the browser (OpenRouter key, SMTP password): expose whether they are
// set instead. The SMTP host and user are shown decrypted so the form can
// display and send them back as plain text.
const toPublicSettings = ({
  openrouterApiKey,
  smtpPassword,
  smtpHost,
  smtpUser,
  ...settings
}: { openrouterApiKey?: string | null; smtpPassword?: string | null; smtpHost?: string | null; smtpUser?: string | null; [key: string]: unknown }) => ({
  ...settings,
  smtpHost: readable(smtpHost),
  smtpUser: readable(smtpUser),
  openrouterApiKeySet: Boolean(openrouterApiKey),
  smtpPasswordSet: Boolean(smtpPassword),
});

export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await prisma.settings.findMany();
    res.json(settings.map(toPublicSettings));
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
    const { openrouterApiKey, aiTextModel, aiImageModel, smtpUser, smtpPassword, smtpHost, smtpPort } =
      req.body;

    const data: Record<string, string | number | null | undefined> = {};

    if (openrouterApiKey !== undefined) data.openrouterApiKey = openrouterApiKey ? encrypt(openrouterApiKey) : null;
    if (aiTextModel !== undefined) data.aiTextModel = aiTextModel || null;
    if (aiImageModel !== undefined) data.aiImageModel = aiImageModel || null;
    if (smtpUser !== undefined) data.smtpUser = smtpUser ? encrypt(smtpUser) : null;
    if (smtpPassword !== undefined) data.smtpPassword = smtpPassword ? encrypt(smtpPassword) : null;
    if (smtpHost !== undefined) data.smtpHost = smtpHost ? encrypt(smtpHost) : null;
    if (smtpPort !== undefined) data.smtpPort = smtpPort || null;

    const settings = await prisma.settings.update({
      where: { id },
      data,
    });
    res.json(toPublicSettings(settings));
  } catch (error) {
    next(error);
  }
};
