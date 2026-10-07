import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword, verifyPassword } from "../utils/bcryptUtils";
import { clearAuthCookie, setAuthCookie } from "../utils/cookieUtils";
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
  res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(seconds / 60)} min.` });
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
      res.status(400).json({ error: "Identifiant et mot de passe requis" });
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
      // Usernames are not unique: only an unambiguous one can log in.
      const matches = await prisma.user.findMany({ where: { username: username.trim() }, take: 2 });
      user = matches.length === 1 ? matches[0] : null;
    }

    const isPasswordCorrect = await verifyPassword(password, user?.password ?? (await unknownUserHash()));
    if (!user || !isPasswordCorrect) {
      accountFailures.fail(account);
      ipFailures.fail(ip);
      res.status(401).json({
        error: "Invalid credentials",
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

    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      res.status(400).json({ error: "Mots de passe manquants ou invalides" });
      return;
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères et au maximum 72 octets." });
      return;
    }

    // The target account always comes from the authenticated session, never the body.
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: "Utilisateur introuvable" });
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
      res.status(401).json({ error: "Mot de passe actuel incorrect" });
      return;
    }
    accountFailures.reset(account);

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
