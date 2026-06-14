import { Queue } from "bullmq";
import { config } from "./config";

export const scrapeQueue = new Queue("scrape", {
  connection: {
    host: config.redis.host,
    port: config.redis.port,
    username: config.redis.username || undefined,
    password: config.redis.password || undefined,
    maxRetriesPerRequest: null,
  },
});
