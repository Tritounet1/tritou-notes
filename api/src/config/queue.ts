import { Queue } from "bullmq";
import IORedis from "ioredis";
import config from "./config";

const connection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  username: config.redis.username,
  password: config.redis.password,
  maxRetriesPerRequest: null,
});

// Finished jobs are trimmed so Redis does not grow forever (results live in PostgreSQL).
export const scrapeQueue = new Queue("scrape", { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } });
