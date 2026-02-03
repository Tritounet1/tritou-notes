import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword } from "../utils/bcryptUtils";
import { createToken } from "../utils/jwtUtils";

export const adminAuthGetRoute = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.status(201).json({ message: "test" });
  } catch (error) {
    next(error);
  }
};

export const adminAuthPostRoute = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, username, password } = req.body;

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: email,
        username: username,
        password: hashedPassword,
        role: "ADMIN",
      },
    });

    const userPermissions = await prisma.userPermissions.create({
      data: {
        modifyScraper: true,
        useScraper: true,
        modifyScraperStatus: true,
        deleteScraper: true,
        createDocument: true,
        deleteDocument: true,
        modifyDocument: true,
        useAiChatBot: true,
        accessScrapersPage: true,
        accessInstancesScrapersPage: true,
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });

    const jwtToken = createToken(user.id.toString(), user.username, user.email);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        userPermissions: userPermissions,
      },
      token: jwtToken,
    });
  } catch (error) {
    next(error);
  }
};
