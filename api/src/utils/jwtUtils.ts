import jwt from "jsonwebtoken";
import config from "../config/config";

export const createToken = (
  id: string,
  username: string,
  email: string,
  role: string,
) => {
  if (config.secretKey === "") {
    console.error("JWT_SECRET is not set.");
    return;
  }

  const token = jwt.sign(
    { id: id, username: username, email: email, role: role },
    config.secretKey,
    {
      expiresIn: "2 days",
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
