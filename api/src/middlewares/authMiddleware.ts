import { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prismaClient";
import { decodeToken } from "../utils/jwtUtils";

export const authHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Recuperer le token depuis le cookie ou le header Authorization
    let token: string | undefined;

    if (req.cookies?.auth_token) {
      token = req.cookies.auth_token;
    } else if (req.headers.authorization) {
      token = req.headers.authorization.replace("Bearer ", "");
    }

    if (token) {
      const verifytoken = decodeToken(token);
      if (!verifytoken || typeof verifytoken === "string" || typeof verifytoken.id !== "string" || !/^\d+$/.test(verifytoken.id)) {
        throw new Error("Invalid token identity");
      }
      const user = await prisma.user.findUnique({
        where: {
          id: parseInt(verifytoken.id),
        },
      });
      if (!user) {
        throw "User not found";
      }
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      };
      return next();
    }

    // Permettre l'acces aux documents publics sans auth
    if (req.method === "GET" && /^\/api\/documents\/\d+(?:\/images\/[0-9a-f-]{36})?\/?$/i.test(req.path)) {
      const documentId = req.path.split("/")[3];
      if (documentId) {
        const document = await prisma.document.findFirst({
          where: { id: parseInt(documentId) },
        });
        if (document?.public) {
          return next();
        }
      }
    }

    throw "Authentication is required";
  } catch (_error) {
    return res.status(401).json({ message: "Authorization required" });
  }
};
