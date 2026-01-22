import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const createDocument = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { title } = req.body;
    const user = await prisma.document.create({
      data: {
        title: title,
        author: null,
      },
    });
    res.status(201).json(user);
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
    res.json(users);
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
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateUser = (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, username, password } = req.body;
    const user = prisma.user.update({
      where: {
        id: id,
      },
      data: {
        email: email,
        username: username,
        password: password,
      },
    });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const deleteUser = (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedUser = prisma.user.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedUser);
  } catch (error) {
    next(error);
  }
};
