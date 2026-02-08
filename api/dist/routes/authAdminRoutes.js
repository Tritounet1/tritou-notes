"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prismaClient_1 = require("../config/prismaClient");
const bcryptUtils_1 = require("../utils/bcryptUtils");
const cookieUtils_1 = require("../utils/cookieUtils");
const jwtUtils_1 = require("../utils/jwtUtils");
const utils_1 = require("../utils/utils");
const adminAuthController_1 = require("../controllers/adminAuthController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Routes pour les invitations (protegees par auth)
router.post("/invite", authMiddleware_1.authHandler, adminAuthController_1.sendInvitation);
// Routes publiques pour l'inscription via invitation
router.get("/invitation/:token", adminAuthController_1.verifyInvitation);
router.post("/invitation/:token", adminAuthController_1.registerWithInvitation);
// Creation du premier admin (uniquement si aucun admin n'existe)
const initFirstAdmin = async () => {
    const nbAdmins = await prismaClient_1.prisma.user.count({
        where: { role: "ADMIN" },
    });
    if (nbAdmins === 0) {
        const randomUrl = (0, utils_1.makeid)(64);
        router.post("/" + randomUrl, async (req, res, next) => {
            try {
                const { email, username, password } = req.body;
                const hashedPassword = await (0, bcryptUtils_1.hashPassword)(password);
                const user = await prismaClient_1.prisma.user.create({
                    data: {
                        email,
                        username,
                        password: hashedPassword,
                        role: "ADMIN",
                    },
                });
                const userPermissions = await prismaClient_1.prisma.userPermissions.create({
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
                const jwtToken = (0, jwtUtils_1.createToken)(user.id.toString(), user.username, user.email, user.role);
                if (!jwtToken) {
                    throw new Error("Erreur lors de la creation du token");
                }
                (0, cookieUtils_1.setAuthCookie)(res, jwtToken);
                res.status(201).json({
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        userPermissions,
                    },
                });
            }
            catch (error) {
                next(error);
            }
        });
        console.log("admin auth page : http://localhost:5173/admin-auth?code=" + randomUrl);
    }
};
initFirstAdmin();
exports.default = router;
