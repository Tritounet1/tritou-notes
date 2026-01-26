interface Config {
  port: number;
  nodeEnv: string;
  secretKey: string;
  anthropicKey: string;
  databaseUrl: string;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  secretKey: process.env.SECRET_JTW_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
};

export default config;
