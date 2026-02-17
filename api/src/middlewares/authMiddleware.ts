import { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prismaClient";
import { decodeToken } from "../utils/jwtUtils";

export interface AppError extends Error {
  status?: number;
}

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
      const verifytoken: any = decodeToken(token);
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
    if (req.path.startsWith("/api/documents/")) {
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
