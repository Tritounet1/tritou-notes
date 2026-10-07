import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { encrypt } from "../utils/utils";
import { generateMcpToken, hashMcpToken } from "../utils/mcpToken";

// Never send the MCP token hash or the OpenRouter key to the browser; expose whether
// they are set instead (sending the encrypted key back would get it re-encrypted on save).
const toPublicSettings = ({
  mcpTokenHash,
  openrouterApiKey,
  ...settings
}: { mcpTokenHash: string | null; openrouterApiKey?: string | null; [key: string]: unknown }) => ({
  ...settings,
  mcpTokenSet: Boolean(mcpTokenHash),
  openrouterApiKeySet: Boolean(openrouterApiKey),
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

/** Creates or replaces the MCP bearer token. The plain token is only in this response. */
export const createMcpToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await prisma.settings.findFirstOrThrow({ select: { id: true } });
    const token = generateMcpToken();
    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: { mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date(), mcpTokenUserId: req.user.id },
    });
    res.status(201).json({ token, createdAt: updated.mcpTokenCreatedAt });
  } catch (error) {
    next(error);
  }
};

/** Revokes the MCP token: the MCP server then rejects every request. */
export const deleteMcpToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await prisma.settings.findFirstOrThrow({ select: { id: true } });
    await prisma.settings.update({
      where: { id: settings.id },
      data: { mcpTokenHash: null, mcpTokenCreatedAt: null, mcpTokenUserId: null },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
