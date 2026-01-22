import jwt from "jsonwebtoken";

export const createToken = (id: string, username: string, email: string) => {
  const SECRET_KEY = process.env["SECRET_JTW_KEY"];

  if (!SECRET_KEY) {
    // must need to return a error cause SECRET_KEY is not in env ):
    return;
  }

  const token = jwt.sign(
    { _id: id, username: username, email: email },
    SECRET_KEY,
    {
      expiresIn: "2 days",
    },
  );

  return token;
};

export const decodeToken = (token: string) => {
  const SECRET_KEY = process.env["SECRET_JTW_KEY"];

  if (!SECRET_KEY) {
    // must need to return a error cause SECRET_KEY is not in env ):
    return;
  }

  const decoded = jwt.verify(token, SECRET_KEY);

  return decoded;
};
