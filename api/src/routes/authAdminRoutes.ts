import { Router } from "express";
import config from "../config/config";
import { prisma } from "../config/prismaClient";
import {
  registerWithInvitation,
  sendInvitation,
  verifyInvitation,
} from "../controllers/adminAuthController";
import { adminMiddleware } from "../middlewares/adminMiddleware";
import { authHandler } from "../middlewares/authMiddleware";
import { hashPassword } from "../utils/bcryptUtils";
import { PASSWORD_RULE, validEmail, validPassword, validUsername } from "../utils/credentials";
import { setAuthCookie } from "../utils/cookieUtils";
import { createToken } from "../utils/jwtUtils";
import { makeid } from "../utils/utils";

const router = Router();

// Routes pour les invitations (protegees par auth)
router.post("/invite", authHandler, adminMiddleware(), sendInvitation);

// Routes publiques pour l'inscription via invitation
router.get("/invitation/:token", verifyInvitation);
router.post("/invitation/:token", registerWithInvitation);

// Creation du premier admin (uniquement si aucun admin n'existe)
const initFirstAdmin = async () => {
  const nbAdmins = await prisma.user.count({
    where: { role: "ADMIN" },
  });

  if (nbAdmins === 0) {
    // ADMIN_BOOTSTRAP_CODE (32+ characters) keeps the link out of the logs: whoever reads
    // the logs could otherwise claim the first admin account.
    const configured = process.env.ADMIN_BOOTSTRAP_CODE ?? "";
    const randomUrl = configured.length >= 32 ? configured : makeid(64);

    router.post("/" + randomUrl, async (req, res, next) => {
      try {
        // The bootstrap URL must stop working as soon as an admin exists.
        if (await prisma.user.count({ where: { role: "ADMIN" } }) > 0) {
          res.status(409).json({ message: "Un administrateur existe déjà" });
          return;
        }
        const { email, username, password } = req.body ?? {};
        if (!validEmail(email) || !validUsername(username)) {
          res.status(400).json({ message: "E-mail valide et nom d'utilisateur requis." });
          return;
        }
        if (!validPassword(password)) {
          res.status(400).json({ message: PASSWORD_RULE });
          return;
        }
        const hashedPassword = await hashPassword(password);

        // Account and permissions in one statement.
        const { userPermissions, ...user } = await prisma.user.create({
          data: {
            email,
            username: username.trim(),
            password: hashedPassword,
            role: "ADMIN",
            userPermissions: {
              create: {
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
              },
            },
          },
          include: { userPermissions: true },
        });

        const jwtToken = createToken(
          user.id.toString(),
          user.username,
          user.email,
          user.role,
          user.tokenVersion,
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
      randomUrl === configured
        ? `admin auth page : ${config.frontendUrl}/admin-auth?code=<ADMIN_BOOTSTRAP_CODE>`
        : `admin auth page : ${config.frontendUrl}/admin-auth?code=` + randomUrl,
    );
  }
};

initFirstAdmin();

export default router;
