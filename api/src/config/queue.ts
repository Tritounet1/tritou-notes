import { Queue } from "bullmq";
import IORedis from "ioredis";

// TODO: Rajouter les process.env dans config.
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

export const scrapeQueue = new Queue("scrape", { connection });
