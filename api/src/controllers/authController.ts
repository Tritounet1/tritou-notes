import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword, verifyPassword } from "../utils/bcryptUtils";
import { clearAuthCookie, setAuthCookie } from "../utils/cookieUtils";
import { PASSWORD_RULE, validPassword } from "../utils/credentials";
import { accountFailures, ipFailures } from "../utils/failureLimiter";
import { createToken } from "../utils/jwtUtils";

// Compared against when the account does not exist, so both cases take the same time.
let dummyHash: Promise<string> | undefined;
const unknownUserHash = () =>
  (dummyHash ??= hashPassword("tritou-notes-unknown-user").catch((error) => {
    dummyHash = undefined;
    throw error;
  }));

const tooManyAttempts = (res: Response, seconds: number) => {
  res.setHeader("Retry-After", String(seconds));
  res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${Math.ceil(seconds / 60)} min.` });
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, username, password } = req.body ?? {};
    // Strings only: an object or a missing field must never turn into a broad Prisma filter.
    const byEmail = typeof email === "string" && email.trim() !== "";
    const byUsername = !byEmail && typeof username === "string" && username.trim() !== "";
    if ((!byEmail && !byUsername) || typeof password !== "string" || !password) {
      res.status(400).json({ message: "Identifiant et mot de passe requis" });
      return;
    }

    const account = byEmail ? `email:${email.trim().toLowerCase()}` : `username:${username.trim()}`;
    const ip = `ip:${req.ip}`;
    const wait = Math.max(accountFailures.retryAfter(account), ipFailures.retryAfter(ip));
    if (wait > 0) {
      tooManyAttempts(res, wait);
      return;
    }

    let user;
    if (byEmail) {
      user = await prisma.user.findUnique({ where: { email: email.trim() } });
    } else {
      user = await prisma.user.findUnique({ where: { username: username.trim() } });
    }

    const isPasswordCorrect = await verifyPassword(password, user?.password ?? (await unknownUserHash()));
    if (!user || !isPasswordCorrect) {
      accountFailures.fail(account);
      ipFailures.fail(ip);
      res.status(401).json({
        message: "Identifiants invalides",
      });
      return;
    }
    accountFailures.reset(account);

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
      user.tokenVersion,
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

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    clearAuthCookie(res);
    res.status(200).json({ message: "Déconnexion réussie" });
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
      res.status(401).json({ message: "Authentification requise" });
      return;
    }

    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      res.status(400).json({ message: "Mots de passe manquants ou invalides" });
      return;
    }

    if (!validPassword(newPassword)) {
      res.status(400).json({ message: PASSWORD_RULE });
      return;
    }

    // The target account always comes from the authenticated session, never the body.
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ message: "Utilisateur introuvable" });
      return;
    }

    const account = `user:${user.id}`;
    const wait = accountFailures.retryAfter(account);
    if (wait > 0) {
      tooManyAttempts(res, wait);
      return;
    }

    const isValid = await verifyPassword(currentPassword, user.password);
    if (!isValid) {
      accountFailures.fail(account);
      res.status(401).json({ message: "Mot de passe actuel incorrect" });
      return;
    }
    accountFailures.reset(account);

    const hashed = await hashPassword(newPassword);
    // A new token version signs out every other session (a stolen token stops working).
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, tokenVersion: { increment: 1 } },
    });
    const jwtToken = createToken(updated.id.toString(), updated.username, updated.email, updated.role, updated.tokenVersion);
    if (jwtToken) setAuthCookie(res, jwtToken);

    res.status(200).json({ message: "Mot de passe mis à jour" });
  } catch (error) {
    next(error);
  }
};

/** Signs out every session of the user (all devices), this one included. */
export const logoutEverywhere = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
    clearAuthCookie(res);
    res.status(200).json({ message: "Toutes les sessions ont été déconnectées" });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      res.status(401).json({ message: "Authentification requise" });
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
