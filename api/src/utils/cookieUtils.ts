import { Response } from "express";
import config from "../config/config";

const IS_PRODUCTION = config.nodeEnv === "production";

export const setAuthCookie = (res: Response, token: string) => {
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    path: "/",
  });
};

export const clearAuthCookie = (res: Response) => {
  res.cookie("auth_token", "", {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "strict" : "lax",
    maxAge: 0,
    path: "/",
  });
};
