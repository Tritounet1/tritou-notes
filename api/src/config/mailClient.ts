import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { decrypt } from "../utils/utils";
import { prisma } from "./prismaClient";

type ConfigOptions = SMTPTransport.Options | null;

const getSmtpOptions = async (): Promise<ConfigOptions> => {
  const settings = await prisma.settings.findFirst({
    where: { id: 1 },
  });

  if (!settings) {
    return null;
  }

  return {
    host: settings.smtpHost ? decrypt(settings.smtpHost) : undefined,
    port: settings.smtpPort ?? undefined,
    secure: settings.smtpPort === 465,
    auth: {
      user: settings.smtpUser ? decrypt(settings.smtpUser) : undefined,
      pass: settings.smtpPassword ? decrypt(settings.smtpPassword) : undefined,
    },
  };
};

export const sendEmail = async (
  to: string,
  subject: string,
  content: string,
) => {
  const options = await getSmtpOptions();

  if (!options) {
    throw new Error("SMTP not configured");
  }

  const transporter = nodemailer.createTransport(options);

  try {
    await transporter.verify();
  } catch (error) {
    console.error("Erreur de configuration SMTP:", error);
  }

  const mailOptions = {
    from: options?.auth?.user ?? `tritou-notes@gmail.com`,
    to: to,
    subject: subject,
    html: content,
  };

  await transporter.sendMail(mailOptions);
};
