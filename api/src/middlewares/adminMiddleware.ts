import { NextFunction, Request, RequestHandler, Response } from "express";

export const adminMiddleware = (): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === "ADMIN") {
      return next();
    }
    // 401 = not logged in, 403 = logged in without the right.
    if (!req.user) return res.status(401).json({ message: "Authorization required" });
    return res.status(403).json({ message: "Admin permissions required" });
  };
};
