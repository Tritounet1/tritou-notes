interface Config {
  port: number;
  nodeEnv: string;
  secretKey: string;
  databaseUrl: string;
  encryptionKey: string;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  secretKey: process.env.SECRET_JTW_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
};

export default config;
