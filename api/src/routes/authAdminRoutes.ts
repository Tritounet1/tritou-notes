import { Router } from "express";
import { prisma } from "../config/prismaClient";
import { adminAuthPostRoute } from "../controllers/adminAuthController";

function makeid(length: number) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

const randomUrl = makeid(64);
const router = Router();

(async () => {
  const nbAdmins = await prisma.user.count({
    where: { role: "ADMIN" },
  });

  if (nbAdmins === 0) {
    router.post("/" + randomUrl, adminAuthPostRoute);
    console.log(
      "admin auth page : http://localhost:5173/admin-auth?code=" + randomUrl,
    );
  }
})();

export default router;
