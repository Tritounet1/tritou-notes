import nodemailer from "nodemailer";
import config from "./config";

const configOptions = {
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPassword,
  },
};

export const sendEmail = async (
  to: string,
  subject: string,
  content: string,
) => {
  console.log("smtp : ", config.smtpHost);

  const transporter = nodemailer.createTransport(configOptions);

  try {
    await transporter.verify();
  } catch (error) {
    console.error("Erreur de configuration SMTP:", error);
  }

  const mailOptions = {
    from: `tristan@tritounet.fr`,
    to: to,
    subject: subject,
    html: content,
  };

  await transporter.sendMail(mailOptions);
};
