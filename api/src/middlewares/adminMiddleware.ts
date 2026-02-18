import { NextFunction, Request, RequestHandler, Response } from "express";

export const adminMiddleware = (): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role === "ADMIN") {
        return next();
      }

      return res.status(401).json({ message: "Admin permissions required" });
    } catch (_error) {
      return res.status(500).json({ message: "Error checking permissions" });
    }
  };
};
