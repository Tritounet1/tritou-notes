import { Response } from "express";
import config from "../config/config";
import { SESSION_DURATION_SECONDS } from "./session";

// Secure cookies whenever the app is served over https, whatever NODE_ENV says.
const SECURE = config.frontendUrl.startsWith("https://");

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: SECURE,
  sameSite: SECURE ? ("strict" as const) : ("lax" as const),
  maxAge,
  path: "/",
});

export const setAuthCookie = (res: Response, token: string) => {
  // Same lifetime as the token it carries.
  res.cookie("auth_token", token, cookieOptions(SESSION_DURATION_SECONDS * 1000));
};

export const clearAuthCookie = (res: Response) => {
  res.cookie("auth_token", "", cookieOptions(0));
};
