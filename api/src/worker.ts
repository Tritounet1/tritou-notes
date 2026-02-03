import { Worker } from "bullmq";
import dotenv from "dotenv";
dotenv.config();

import * as cheerio from "cheerio";
import IORedis from "ioredis";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import vm from "vm";
import { prisma } from "./config/prismaClient";

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
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
      args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // User-Agent réaliste
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Viewport réaliste
    await page.setViewport({ width: 1920, height: 1080 });

    // Headers supplémentaires
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

new Worker(
  "scrape",
  async (job) => {
    try {
      const instanceScrape = await prisma.instanceScrape.findFirst({
        where: {
          id: job.data.id,
        },
      });

      await prisma.instanceScrape.update({
        where: { id: job.data.id },
        data: {
          status: "WORKING",
          last_update: new Date(),
        },
      });

      console.log("Start scraping for : ", instanceScrape?.id);

      const instanceScrapeBaseUrl = instanceScrape?.url
        ? new URL(instanceScrape.url).origin
        : null;

      const scraper = await prisma.scraper.findFirst({
        where: {
          base_url: {
            has: instanceScrapeBaseUrl,
          },
          status: "ACTIVE",
        },
      });

      if (scraper === null || scraper === undefined) {
        throw "Error: Scraper not found";
      }

      if (
        scraper?.code === null ||
        scraper?.code === undefined ||
        scraper?.code === ""
      ) {
        throw "Error: Scraper don't have code.";
      }

      if (instanceScrape === null || instanceScrape === undefined) {
        throw "Error: Instance of scrape not found.";
      }

      const response = await scrapeWithBrowser(
        instanceScrape?.url,
        scraper?.code,
      );

      if (!response) {
        throw "Error: No response from scraper.";
      }

      await prisma.instanceScrape.update({
        where: { id: job.data.id },
        data: {
          status: "FINISHED",
          last_update: new Date(),
          response: response,
        },
      });

      console.log("Finish scraping for : ", instanceScrape?.id);
    } catch (e) {
      await prisma.instanceScrape.update({
        where: { id: job.data.id },
        data: {
          status: "ERROR",
          last_update: new Date(),
          response: { error: e as any }, // TODO: find the correct way to replace this any
        },
      });
      console.log("Error : ", e);
    }
  },
  { connection, concurrency: 1 },
);
