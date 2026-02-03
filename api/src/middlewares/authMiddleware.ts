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
    /* TODO: pas fonctionnel à changer
    if (req.path.startsWith("/api/documents/")) {
      const documentId = req.path.split("/")[3];
      console.log("On est dans document : ", documentId);
      if (documentId) {
        console.log("testtt");
        const document = await prisma.document.findFirst({
          where: { id: parseInt(documentId) },
        });
        console.log("document : ", document);
        if (document?.public) {
          return next();
        }
      }
    }
    */

    if (req.headers.authorization) {
      const token = req.headers.authorization;
      if (!token) {
        throw "Authentication is required";
      }
      const verifytoken: any = decodeToken(token.replace("Bearer ", ""));
      const user = await prisma.user.findFirst({
        where: {
          id: verifytoken.id,
        },
      });
      if (!user) {
        throw "User not found";
      }
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
      };
      next();
    } else {
      throw "Authentication is required";
    }
  } catch (error) {
    return res.status(400).json({ message: "Authorization required" });
  }
};
