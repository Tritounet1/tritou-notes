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

    const jwtToken = createToken(user.id.toString(), user.username, user.email);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
      token: jwtToken,
    });
  } catch (error) {
    next(error);
  }
};
