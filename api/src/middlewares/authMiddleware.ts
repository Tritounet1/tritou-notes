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
    if (req.headers.authorization) {
      const token = req.headers.authorization;
      const verifytoken: any = decodeToken(token);
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
