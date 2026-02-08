"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWithInvitation = exports.verifyInvitation = exports.sendInvitation = void 0;
const mailClient_1 = require("../config/mailClient");
const prismaClient_1 = require("../config/prismaClient");
const bcryptUtils_1 = require("../utils/bcryptUtils");
const cookieUtils_1 = require("../utils/cookieUtils");
const jwtUtils_1 = require("../utils/jwtUtils");
const utils_1 = require("../utils/utils");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
// Envoyer une invitation par email
const sendInvitation = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({ error: "Email requis" });
            return;
        }
        // Verifier si l'email existe deja
        const existingUser = await prismaClient_1.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            res.status(400).json({ error: "Cet email est deja utilise" });
            return;
        }
        // Creer un token unique
        const token = (0, utils_1.makeid)(64);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours
        // Supprimer les anciennes invitations pour cet email
        await prismaClient_1.prisma.invitation.deleteMany({ where: { email } });
        // Creer l'invitation
        await prismaClient_1.prisma.invitation.create({
            data: {
                email,
                token,
                expires_at: expiresAt,
            },
        });
        const inviteLink = `${FRONTEND_URL}/register?token=${token}`;
        // Envoyer l'email
        await (0, mailClient_1.sendEmail)(email, "Invitation a rejoindre la plateforme", `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1f2937;">Vous avez ete invite !</h1>
          <p style="color: #4b5563; font-size: 16px;">
            Vous avez ete invite a creer un compte sur notre plateforme.
          </p>
          <p style="color: #4b5563; font-size: 16px;">
            Cliquez sur le bouton ci-dessous pour finaliser votre inscription :
          </p>
          <a href="${inviteLink}"
             style="display: inline-block; background-color: #1f2937; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Creer mon compte
          </a>
          <p style="color: #9ca3af; font-size: 14px;">
            Ce lien expire dans 7 jours.
          </p>
          <p style="color: #9ca3af; font-size: 12px;">
            Si vous n'avez pas demande cette invitation, ignorez cet email.
          </p>
        </div>
      `);
        res.status(201).json({ message: "Invitation envoyee" });
    }
    catch (error) {
        next(error);
    }
};
exports.sendInvitation = sendInvitation;
// Verifier si un token d'invitation est valide
const verifyInvitation = async (req, res, next) => {
    try {
        const token = req.params.token;
        const invitation = await prismaClient_1.prisma.invitation.findUnique({ where: { token } });
        if (!invitation) {
            res.status(404).json({ error: "Invitation non trouvee" });
            return;
        }
        if (invitation.used) {
            res.status(400).json({ error: "Cette invitation a deja ete utilisee" });
            return;
        }
        if (new Date() > invitation.expires_at) {
            res.status(400).json({ error: "Cette invitation a expire" });
            return;
        }
        res.json({ email: invitation.email });
    }
    catch (error) {
        next(error);
    }
};
exports.verifyInvitation = verifyInvitation;
// Inscription via une invitation
const registerWithInvitation = async (req, res, next) => {
    try {
        const token = req.params.token;
        const { username, password } = req.body;
        // Verifier l'invitation
        const invitation = await prismaClient_1.prisma.invitation.findUnique({ where: { token } });
        if (!invitation) {
            res.status(404).json({ error: "Invitation non trouvee" });
            return;
        }
        if (invitation.used) {
            res.status(400).json({ error: "Cette invitation a deja ete utilisee" });
            return;
        }
        if (new Date() > invitation.expires_at) {
            res.status(400).json({ error: "Cette invitation a expire" });
            return;
        }
        // Creer l'utilisateur
        const hashedPassword = await (0, bcryptUtils_1.hashPassword)(password);
        const user = await prismaClient_1.prisma.user.create({
            data: {
                email: invitation.email,
                username,
                password: hashedPassword,
                role: "USER",
            },
        });
        // Creer les permissions par defaut
        const userPermissions = await prismaClient_1.prisma.userPermissions.create({
            data: {
                createDocument: true,
                modifyDocument: true,
                deleteDocument: true,
                userId: user.id,
            },
        });
        // Marquer l'invitation comme utilisee
        await prismaClient_1.prisma.invitation.update({
            where: { token },
            data: { used: true },
        });
        // Generer le token JWT et le mettre dans un cookie
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
};
exports.registerWithInvitation = registerWithInvitation;
