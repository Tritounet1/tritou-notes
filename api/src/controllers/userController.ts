import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword } from "../utils/bcryptUtils";

const publicUser = <T extends { password: string }>(user: T) => {
  const { password: _password, ...safeUser } = user;
  void _password;
  return safeUser;
};

const validPassword = (password: unknown): password is string =>
  typeof password === "string" && password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72;

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, username, password } = req.body;
    if (!validPassword(password)) {
      res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères et au maximum 72 octets." });
      return;
    }
    const user = await prisma.user.create({
      data: {
        email: email,
        username: username,
        password: await hashPassword(password),
      },
    });
    await prisma.userPermissions.create({
      data: {
        user: {
          connect: {
            id: user.id,
          },
        },
      },
    });
    res.status(201).json(publicUser(user));
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users.map(publicUser));
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await prisma.user.findUnique({
      where: {
        id: id,
      },
    });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, username, password } = req.body;
    if (password !== undefined && password !== "" && !validPassword(password)) {
      res.status(400).json({ message: "Mot de passe invalide" });
      return;
    }
    const user = await prisma.user.update({
      where: {
        id: id,
      },
      data: {
        email: email,
        username: username,
        password: password ? await hashPassword(password) : undefined,
      },
    });
    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedUser = await prisma.user.delete({
      where: {
        id: id,
      },
    });
    res.json(publicUser(deletedUser));
  } catch (error) {
    next(error);
  }
};
