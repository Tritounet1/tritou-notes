import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { generateMcpToken, hashMcpToken } from "../utils/mcpToken";

// Personal MCP tokens (Paramètres › MCP): each user manages their own. The MCP server acts as
// the token's user, with that user's permissions; a read-only token only gets the reading tools.

const publicToken = ({ id, name, readOnly, created_at, last_used_at }: { id: number; name: string; readOnly: boolean; created_at: Date; last_used_at: Date | null }) => ({
  id,
  name,
  readOnly,
  created_at,
  last_used_at,
});

export const listMcpTokens = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await prisma.mcpToken.findMany({ where: { userId: req.user.id }, orderBy: { created_at: "desc" } });
    res.json(tokens.map(publicToken));
  } catch (error) {
    next(error);
  }
};

/** The plain token is only in this response; only its SHA-256 is stored. */
export const createMcpToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
    if (!name) {
      res.status(400).json({ message: "Donnez un nom au jeton (ex. « Claude Code, portable »)." });
      return;
    }
    const token = generateMcpToken();
    const created = await prisma.mcpToken.create({
      data: { name, readOnly: req.body?.readOnly === true, hash: hashMcpToken(token), userId: req.user.id },
    });
    res.status(201).json({ ...publicToken(created), token });
  } catch (error) {
    next(error);
  }
};

export const deleteMcpToken = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    // Only the owner revokes a token: deleteMany with the owner scopes it.
    const { count } = await prisma.mcpToken.deleteMany({ where: { id: parseInt(req.params.id, 10), userId: req.user.id } });
    if (count === 0) {
      res.status(404).json({ message: "Jeton introuvable." });
      return;
    }
    res.json({ message: "Jeton révoqué." });
  } catch (error) {
    next(error);
  }
};
