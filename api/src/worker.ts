import { Worker } from "bullmq";
import cronParser from "cron-parser";
import dotenv from "dotenv";
dotenv.config();

import * as cheerio from "cheerio";
import IORedis from "ioredis";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import vm from "vm";
import { prisma } from "./config/prismaClient";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

puppeteer.use(StealthPlugin());

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const scrapeWithBrowser = async (url: string, code: string) => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.setViewport({ width: 1920, height: 1080 });

    await page.setExtraHTTPHeaders({
      "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await page.goto(url, { waitUntil: "networkidle2" });
    await sleep(3);

    const htmlContent = await page.content();
    const $ = cheerio.load(htmlContent);

    const context = { $, result: null };

    vm.createContext(context);
    vm.runInContext(code, context);

    await browser.close();

    return {
      url: url,
      ...(context.result as any),
    };
  } catch (e) {
    console.log("error : ", e);
  }
};

console.log("Start worker for scraping queue.");

const scrapeInstance = async (
  instanceId: number,
  schedulerId?: number | null,
) => {
  const instanceScrape = await prisma.instanceScrape.findFirst({
    where: { id: instanceId },
  });

  if (!instanceScrape) {
    throw "Error: Instance of scrape not found.";
  }

  await prisma.instanceScrape.update({
    where: { id: instanceId },
    data: {
      status: "WORKING",
      last_update: new Date(),
    },
  });

  console.log("Start scraping for instance: ", instanceScrape.id);

  const instanceScrapeBaseUrl = new URL(instanceScrape.url).origin;

  const scraper = await prisma.scraper.findFirst({
    where: {
      base_url: { has: instanceScrapeBaseUrl },
      status: "ACTIVE",
    },
  });

  if (!scraper) {
    throw "Error: Scraper not found";
  }

  if (!scraper.code) {
    throw "Error: Scraper don't have code.";
  }

  const response = await scrapeWithBrowser(instanceScrape.url, scraper.code);

  if (!response) {
    throw "Error: No response from scraper.";
  }

  if (instanceScrape.response) {
    await prisma.instanceScrapeHistory.create({
      data: {
        url: instanceScrape.url,
        response: instanceScrape.response,
        status: instanceScrape.status,
        instanceScrapeId: instanceScrape.id,
        scrapingSchedulerId: schedulerId || null,
      },
    });
  }

  await prisma.instanceScrape.update({
    where: { id: instanceId },
    data: {
      status: "FINISHED",
      last_update: new Date(),
      response: response,
    },
  });

  console.log("Finish scraping for instance: ", instanceScrape.id);
};

new Worker(
  "scrape",
  async (job) => {
    try {
      if (job.data.schedulerId) {
        const schedulerId = job.data.schedulerId;
        console.log("Start scheduled scraping for scheduler: ", schedulerId);

        await prisma.scrapingScheduler.update({
          where: { id: schedulerId },
          data: {
            status: "RUNNING",
            last_run_at: new Date(),
          },
        });

        const instances = await prisma.instanceScrape.findMany({
          where: { scrapingSchedulerId: schedulerId },
        });

        console.log(
          `Found ${instances.length} instances for scheduler ${schedulerId}`,
        );

        for (const instance of instances) {
          try {
            await scrapeInstance(instance.id, schedulerId);
          } catch (e) {
            console.log(`Error scraping instance ${instance.id}: `, e);

            await prisma.instanceScrapeHistory.create({
              data: {
                url: instance.url,
                response: { error: String(e) },
                status: "ERROR",
                instanceScrapeId: instance.id,
                scrapingSchedulerId: schedulerId,
              },
            });

            await prisma.instanceScrape.update({
              where: { id: instance.id },
              data: {
                status: "ERROR",
                last_update: new Date(),
                response: { error: String(e) },
              },
            });
          }
        }

        const scheduler = await prisma.scrapingScheduler.findUnique({
          where: { id: schedulerId },
        });

        let nextRun = null;
        if (scheduler?.cron_expression) {
          const interval = cronParser.parse(scheduler.cron_expression);
          nextRun = interval.next().toDate();
        }

        await prisma.scrapingScheduler.update({
          where: { id: schedulerId },
          data: {
            status: "ACTIVATE",
            update_at: new Date(),
            next_run_at: nextRun,
          },
        });

        console.log("Finish scheduled scraping for scheduler: ", schedulerId);
        return;
      }

      if (job.data.id) {
        await scrapeInstance(job.data.id, null);
        return;
      }

      console.log("Unknown job type: ", job.name, job.data);
    } catch (e) {
      if (job.data.id) {
        const instance = await prisma.instanceScrape.findFirst({
          where: { id: job.data.id },
        });

        if (instance) {
          await prisma.instanceScrapeHistory.create({
            data: {
              url: instance.url,
              response: { error: String(e) },
              status: "ERROR",
              instanceScrapeId: instance.id,
              scrapingSchedulerId: instance.scrapingSchedulerId,
            },
          });
        }

        await prisma.instanceScrape.update({
          where: { id: job.data.id },
          data: {
            status: "ERROR",
            last_update: new Date(),
            response: { error: String(e) },
          },
        });
      }
      if (job.data.schedulerId) {
        await prisma.scrapingScheduler.update({
          where: { id: job.data.schedulerId },
          data: {
            status: "ERROR",
            update_at: new Date(),
          },
        });
      }
      console.log("Error: ", e);
    }
  },
  { connection, concurrency: 1 },
);
