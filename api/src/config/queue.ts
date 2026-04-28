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

export const scrapeQueue = new Queue("scrape", { connection });
