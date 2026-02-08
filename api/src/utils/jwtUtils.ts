import jwt from "jsonwebtoken";
import config from "../config/config";

export const createToken = (
  id: string,
  username: string,
  email: string,
  role: string,
) => {
  if (config.secretKey === "") {
    // TODO: must need to return a error cause SECRET_KEY is not in env ):
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
    // TODO: must need to return a error cause SECRET_KEY is not in env ):
    return;
  }

  const decoded = jwt.verify(token, config.secretKey);

  return decoded;
};
