import { Router } from "express";
import { prisma } from "../config/prismaClient";
import { hashPassword } from "../utils/bcryptUtils";
import { setAuthCookie } from "../utils/cookieUtils";
import { createToken } from "../utils/jwtUtils";
import { makeid } from "../utils/utils";
import {
  registerWithInvitation,
  sendInvitation,
  verifyInvitation,
} from "../controllers/adminAuthController";
import { authHandler } from "../middlewares/authMiddleware";

const router = Router();

// Routes pour les invitations (protegees par auth)
router.post("/invite", authHandler, sendInvitation);

// Routes publiques pour l'inscription via invitation
router.get("/invitation/:token", verifyInvitation);
router.post("/invitation/:token", registerWithInvitation);

// Creation du premier admin (uniquement si aucun admin n'existe)
const initFirstAdmin = async () => {
  const nbAdmins = await prisma.user.count({
    where: { role: "ADMIN" },
  });

  if (nbAdmins === 0) {
    const randomUrl = makeid(64);

    router.post("/" + randomUrl, async (req, res, next) => {
      try {
        const { email, username, password } = req.body;
        const hashedPassword = await hashPassword(password);

        const user = await prisma.user.create({
          data: {
            email,
            username,
            password: hashedPassword,
            role: "ADMIN",
          },
        });

        const userPermissions = await prisma.userPermissions.create({
          data: {
            modifyScraper: true,
            useScraper: true,
            modifyScraperStatus: true,
            deleteScraper: true,
            createDocument: true,
            deleteDocument: true,
            modifyDocument: true,
            useAiChatBot: true,
            accessScrapersPage: true,
            accessInstancesScrapersPage: true,
            userId: user.id,
          },
        });

        const jwtToken = createToken(
          user.id.toString(),
          user.username,
          user.email,
          user.role,
        );

        if (!jwtToken) {
          throw new Error("Erreur lors de la creation du token");
        }

        setAuthCookie(res, jwtToken);

        res.status(201).json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            userPermissions,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    console.log(
      "admin auth page : http://localhost:5173/admin-auth?code=" + randomUrl,
    );
  }
};

initFirstAdmin();

export default router;
