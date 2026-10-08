import { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prismaClient";
import { UserPermissions } from "../generated/prisma/client";

type PermissionKey = keyof Omit<UserPermissions, "id" | "userId">;

/** Every listed permission is required (admins have them all). */
export const requirePermission = (...permissions: PermissionKey[]): RequestHandler => permissionCheck(permissions, "all");

/** One of the listed permissions is enough. */
export const requireAnyPermission = (...permissions: PermissionKey[]): RequestHandler => permissionCheck(permissions, "any");

const permissionCheck = (
  permissions: PermissionKey[],
  mode: "all" | "any",
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "ADMIN") {
        return next();
      }

      if (!req.user?.id) {
        return res.status(401).json({ message: "Authentification requise" });
      }

      const userPermissions = await prisma.userPermissions.findUnique({
        where: { userId: req.user.id },
      });

      if (!userPermissions) {
        return res.status(403).json({ message: "Aucune permission configurée pour ce compte" });
      }

      const granted = (perm: PermissionKey) => userPermissions[perm] === true;
      const hasPermission = mode === "all" ? permissions.every(granted) : permissions.some(granted);

      if (!hasPermission) {
        return res.status(403).json({ message: "Permission refusée" });
      }

      return next();
    } catch (_error) {
      return res.status(500).json({ message: "Erreur lors de la vérification des permissions" });
    }
  };
};
