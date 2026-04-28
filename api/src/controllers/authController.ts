import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword, verifyPassword } from "../utils/bcryptUtils";
import { clearAuthCookie, setAuthCookie } from "../utils/cookieUtils";
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
    const userPermissions = await prisma.userPermissions.findFirst({
      where: {
        userId: user.id,
      },
    });
    const jwtToken = createToken(
      user.id.toString(),
      user.username,
      user.email,
      user.role,
    );

    if (!jwtToken) {
      throw new Error("Erreur lors de la creation du token");
    }

    setAuthCookie(res, jwtToken);

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        userPermissions: userPermissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
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
    const userPermissions = await prisma.userPermissions.findFirst({
      where: {
        id: newUser.id,
      },
    });
    const jwtToken = createToken(
      newUser.id.toString(),
      newUser.username,
      newUser.email,
      newUser.role,
    );

    if (!jwtToken) {
      throw new Error("Erreur lors de la creation du token");
    }

    setAuthCookie(res, jwtToken);

    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        userPermissions: userPermissions,
      },
    });
  } catch (error) {
    next(error);
  }
};
*/

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    clearAuthCookie(res);
    res.status(200).json({ message: "Deconnexion reussie" });
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Non authentifie" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Champs manquants" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable" });
      return;
    }

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      res.status(401).json({ error: "Mot de passe actuel incorrect" });
      return;
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });

    res.status(200).json({ message: "Mot de passe mis a jour" });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Non authentifie" });
      return;
    }

    const userPermissions = await prisma.userPermissions.findFirst({
      where: { userId: req.user.id },
    });

    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        userPermissions,
      },
    });
  } catch (error) {
    next(error);
  }
};
