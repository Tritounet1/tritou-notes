import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { encrypt } from "../utils/utils";
import { generateMcpToken, hashMcpToken } from "../utils/mcpToken";

// Never send the token hash to the browser; expose whether one is set instead.
const toPublicSettings = ({ mcpTokenHash, ...settings }: { mcpTokenHash: string | null; [key: string]: unknown }) => ({
  ...settings,
  mcpTokenSet: Boolean(mcpTokenHash),
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
      data: { mcpTokenHash: hashMcpToken(token), mcpTokenCreatedAt: new Date() },
    });
    res.status(201).json({ token, createdAt: updated.mcpTokenCreatedAt });
  } catch (error) {
    next(error);
  }
};

/** Revokes the MCP token: the HTTP MCP server then rejects every request. */
export const deleteMcpToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const settings = await prisma.settings.findFirstOrThrow({ select: { id: true } });
    await prisma.settings.update({
      where: { id: settings.id },
      data: { mcpTokenHash: null, mcpTokenCreatedAt: null },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};
