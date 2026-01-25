import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword, verifyPassword } from "../utils/bcryptUtils";
import { createToken } from "../utils/jwtUtils";

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, username, password } = req.body;
    let user;
    if (email === "") {
      user = await prisma.user.findFirst({
        where: { username: username },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { email: email },
      });
    }
    if (user === undefined || user === null) {
      res.status(401).json({
        error: "Invalid credentials",
      });
      return;
    }
    const isPasswordCorrect = await verifyPassword(password, user.password);
    if (!isPasswordCorrect) {
      res.status(401).json({
        error: "Invalid credentials",
      });
      return;
    }
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

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, username, password } = req.body;
    let user;
    if (email === "") {
      user = await prisma.user.findFirst({
        where: { username: username },
      });
    } else {
      user = await prisma.user.findFirst({
        where: { email: email },
      });
    }
    if (user !== undefined && user !== null) {
      res.status(401).json({
        error: "User already exist with this username or email",
      });
      return;
    }
    const hashedPassword = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        username: username,
        email: email,
        password: hashedPassword,
      },
    });
    const jwtToken = createToken(
      newUser.id.toString(),
      newUser.username,
      newUser.email,
    );
    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
      token: jwtToken,
    });
  } catch (error) {
    next(error);
  }
};
