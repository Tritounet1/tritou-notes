import jwt from "jsonwebtoken";
import config from "../config/config";
import { SESSION_DURATION_SECONDS } from "./session";

export const createToken = (
  id: string,
  username: string,
  email: string,
  role: string,
  /** User.tokenVersion: a token whose version is outdated is refused (see authHandler). */
  version = 0,
) => {
  if (config.secretKey === "") {
    console.error("JWT_SECRET is not set.");
    return;
  }

  const token = jwt.sign(
    { id: id, username: username, email: email, role: role, v: version },
    config.secretKey,
    {
      expiresIn: SESSION_DURATION_SECONDS,
    },
  );

  return token;
};

export const decodeToken = (token: string) => {
  if (!config.secretKey) {
    console.error("JWT_SECRET is not set.");
    return;
  }

  const decoded = jwt.verify(token, config.secretKey);

  return decoded;
};
