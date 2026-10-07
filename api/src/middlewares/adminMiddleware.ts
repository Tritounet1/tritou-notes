import { NextFunction, Request, RequestHandler, Response } from "express";

export const adminMiddleware = (): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === "ADMIN") {
      return next();
    }
    return res.status(401).json({ message: "Admin permissions required" });
  };
};
