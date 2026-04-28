import { NextFunction, Request, Response } from "express";
import { sendEmail } from "../config/mailClient";
import { prisma } from "../config/prismaClient";
import { hashPassword } from "../utils/bcryptUtils";
import { setAuthCookie } from "../utils/cookieUtils";
import { createToken } from "../utils/jwtUtils";
import { makeid } from "../utils/utils";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Envoyer une invitation par email
export const sendInvitation = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "Email requis" });
      return;
    }

    // Verifier si l'email existe deja
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: "Cet email est deja utilise" });
      return;
    }

    // Creer un token unique
    const token = makeid(64);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Supprimer les anciennes invitations pour cet email
    await prisma.invitation.deleteMany({ where: { email } });

    // Creer l'invitation
    await prisma.invitation.create({
      data: {
        email,
        token,
        expires_at: expiresAt,
      },
    });

    const inviteLink = `${FRONTEND_URL}/register?token=${token}`;

    // Envoyer l'email
    await sendEmail(
      email,
      "Invitation a rejoindre la plateforme",
      `
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
      `,
    );

    res.status(201).json({ message: "Invitation envoyee" });
  } catch (error) {
    next(error);
  }
};

// Verifier si un token d'invitation est valide
export const verifyInvitation = async (
  req: Request<{ token: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.params.token;

    const invitation = await prisma.invitation.findUnique({ where: { token } });

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
  } catch (error) {
    next(error);
  }
};

// Inscription via une invitation
export const registerWithInvitation = async (
  req: Request<{ token: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.params.token;
    const { username, password } = req.body;

    // Verifier l'invitation
    const invitation = await prisma.invitation.findUnique({ where: { token } });

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

    // Verifier si l'email est deja utilise
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existingUser) {
      res.status(400).json({ error: "Cet email est deja utilise" });
      return;
    }

    // Creer l'utilisateur
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: invitation.email,
        username,
        password: hashedPassword,
        role: "USER",
      },
    });

    // Creer les permissions par defaut
    const userPermissions = await prisma.userPermissions.create({
      data: {
        createDocument: true,
        modifyDocument: true,
        deleteDocument: true,
        userId: user.id,
      },
    });

    // Marquer l'invitation comme utilisee
    await prisma.invitation.update({
      where: { token },
      data: { used: true },
    });

    // Generer le token JWT et le mettre dans un cookie
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
};
