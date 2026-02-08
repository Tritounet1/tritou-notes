"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = __importDefault(require("./config"));
const configOptions = {
    host: config_1.default.smtpHost,
    port: config_1.default.smtpPort,
    secure: config_1.default.smtpPort === 465,
    auth: {
        user: config_1.default.smtpUser,
        pass: config_1.default.smtpPassword,
    },
};
const sendEmail = async (to, subject, content) => {
    console.log("smtp : ", config_1.default.smtpHost);
    const transporter = nodemailer_1.default.createTransport(configOptions);
    try {
        await transporter.verify();
    }
    catch (error) {
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
exports.sendEmail = sendEmail;
// export default transporter;
