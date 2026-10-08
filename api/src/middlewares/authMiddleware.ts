import { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prismaClient";
import { decodeToken } from "../utils/jwtUtils";

/** The user a session token belongs to, or null for a missing / invalid / stale token. */
const userFromToken = async (token: string) => {
  const payload = decodeToken(token);
  if (!payload || typeof payload === "string" || typeof payload.id !== "string" || !/^\d+$/.test(payload.id)) return null;
  const user = await prisma.user.findUnique({ where: { id: parseInt(payload.id) } });
  // Tokens issued before a password change carry an older version (none = 0).
  return user && (payload.v ?? 0) === (user.tokenVersion ?? 0) ? user : null;
};

const PUBLIC_DOCUMENT_PATH = /^\/api\/documents\/\d+(?:\/images\/[0-9a-f-]{36})?\/?$/i;

export const authHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Token from the cookie, or from the Authorization header.
    const token = req.cookies?.auth_token ?? req.headers.authorization?.replace("Bearer ", "");
    let user = null;
    try {
      user = token ? await userFromToken(token) : null;
    } catch {
      // Bad signature or expired token: treated like no token below.
    }
    if (user) {
      req.user = { id: user.id, email: user.email, username: user.username, role: user.role };
      return next();
    }

    // Public documents stay readable without a valid session (even with an expired cookie).
    if (req.method === "GET" && PUBLIC_DOCUMENT_PATH.test(req.path)) {
      const document = await prisma.document.findFirst({ where: { id: parseInt(req.path.split("/")[3]) } });
      if (document?.public) return next();
    }

    return res.status(401).json({ message: "Authentification requise" });
  } catch {
    return res.status(401).json({ message: "Authentification requise" });
  }
};
