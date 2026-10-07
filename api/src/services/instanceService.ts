import { prisma } from "../config/prismaClient";
import { scrapeQueue } from "../config/queue";
import { assertScrapableUrl } from "../scraping/networkGuard";

/**
 * Creates a scrape instance. A standalone URL is queued right away; a URL attached
 * to a scheduler waits for the scheduler's runs.
 */
export const createInstance = async ({ url, scrapingSchedulerId, scraperId }: { url: string; scrapingSchedulerId?: number; scraperId?: number }) => {
  const instance = await prisma.instanceScrape.create({ data: { url: assertScrapableUrl(String(url ?? "")), scrapingSchedulerId, scraperId } });
  if (!scrapingSchedulerId) await scrapeQueue.add("scrape-url", { id: instance.id });
  return instance;
};
