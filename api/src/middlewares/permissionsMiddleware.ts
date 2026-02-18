import { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../config/prismaClient";
import { UserPermissions } from "../generated/prisma/client";

type PermissionKey = keyof Omit<UserPermissions, "id" | "userId">;

export const requirePermission = (
  ...permissions: PermissionKey[]
): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "ADMIN") {
        return next();
      }

      if (!req.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userPermissions = await prisma.userPermissions.findUnique({
        where: { userId: req.user.id },
      });

      if (!userPermissions) {
        return res.status(403).json({ message: "No permissions configured" });
      }

      const hasPermission = permissions.every(
        (perm) => userPermissions[perm] === true,
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Permission denied" });
      }

      return next();
    } catch (_error) {
      return res.status(500).json({ message: "Error checking permissions" });
    }
  };
};
