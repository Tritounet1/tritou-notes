import dotenv from "dotenv";
dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  secretKey: string;
  anthropicKey: string;
  databaseUrl: string;
  smtpUser: string;
  smtpPassword: string;
  smtpHost: string;
  smtpPort: number;
  encryptionKey: string;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  secretKey: process.env.SECRET_JTW_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  smtpUser: process.env.SMTP_USER || "",
  smtpPassword: process.env.SMTP_PASSWORD || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  encryptionKey: process.env.ENCRYPTION_KEY || "",
};

export default config;
