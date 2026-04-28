interface RedisConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

interface Config {
  port: number;
  nodeEnv: string;
  secretKey: string;
  databaseUrl: string;
  encryptionKey: string;
  frontendUrl: string;
  redis: RedisConfig;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  secretKey: process.env.SECRET_JTW_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    username: process.env.REDIS_USERNAME || "",
    password: process.env.REDIS_PASSWORD || "",
  },
};

export default config;
