"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const cron_parser_1 = __importDefault(require("cron-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const cheerio = __importStar(require("cheerio"));
const ioredis_1 = __importDefault(require("ioredis"));
const puppeteer_extra_1 = __importDefault(require("puppeteer-extra"));
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const vm_1 = __importDefault(require("vm"));
const prismaClient_1 = require("./config/prismaClient");
const connection = new ioredis_1.default({
    host: "127.0.0.1",
    port: 6379,
    maxRetriesPerRequest: null,
});
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
const sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
const scrapeWithBrowser = async (url, code) => {
    try {
        const browser = await puppeteer_extra_1.default.launch({
            headless: true,
            args: ["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"],
        });
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setExtraHTTPHeaders({
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        });
        await page.goto(url, { waitUntil: "networkidle2" });
        await sleep(3);
        const htmlContent = await page.content();
        const $ = cheerio.load(htmlContent);
        const context = { $, result: null };
        vm_1.default.createContext(context);
        vm_1.default.runInContext(code, context);
        await browser.close();
        return {
            url: url,
            ...context.result,
        };
    }
    catch (e) {
        console.log("error : ", e);
    }
};
console.log("Start worker for scraping queue.");
const scrapeInstance = async (instanceId, schedulerId) => {
    const instanceScrape = await prismaClient_1.prisma.instanceScrape.findFirst({
        where: { id: instanceId },
    });
    if (!instanceScrape) {
        throw "Error: Instance of scrape not found.";
    }
    await prismaClient_1.prisma.instanceScrape.update({
        where: { id: instanceId },
        data: {
            status: "WORKING",
            last_update: new Date(),
        },
    });
    console.log("Start scraping for instance: ", instanceScrape.id);
    const instanceScrapeBaseUrl = new URL(instanceScrape.url).origin;
    const scraper = await prismaClient_1.prisma.scraper.findFirst({
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
        await prismaClient_1.prisma.instanceScrapeHistory.create({
            data: {
                url: instanceScrape.url,
                response: instanceScrape.response,
                status: instanceScrape.status,
                instanceScrapeId: instanceScrape.id,
                scrapingSchedulerId: schedulerId || null,
            },
        });
    }
    await prismaClient_1.prisma.instanceScrape.update({
        where: { id: instanceId },
        data: {
            status: "FINISHED",
            last_update: new Date(),
            response: response,
        },
    });
    console.log("Finish scraping for instance: ", instanceScrape.id);
};
new bullmq_1.Worker("scrape", async (job) => {
    try {
        if (job.data.schedulerId) {
            const schedulerId = job.data.schedulerId;
            console.log("Start scheduled scraping for scheduler: ", schedulerId);
            await prismaClient_1.prisma.scrapingScheduler.update({
                where: { id: schedulerId },
                data: {
                    status: "RUNNING",
                    last_run_at: new Date(),
                },
            });
            const instances = await prismaClient_1.prisma.instanceScrape.findMany({
                where: { scrapingSchedulerId: schedulerId },
            });
            console.log(`Found ${instances.length} instances for scheduler ${schedulerId}`);
            for (const instance of instances) {
                try {
                    await scrapeInstance(instance.id, schedulerId);
                }
                catch (e) {
                    console.log(`Error scraping instance ${instance.id}: `, e);
                    await prismaClient_1.prisma.instanceScrapeHistory.create({
                        data: {
                            url: instance.url,
                            response: { error: String(e) },
                            status: "ERROR",
                            instanceScrapeId: instance.id,
                            scrapingSchedulerId: schedulerId,
                        },
                    });
                    await prismaClient_1.prisma.instanceScrape.update({
                        where: { id: instance.id },
                        data: {
                            status: "ERROR",
                            last_update: new Date(),
                            response: { error: String(e) },
                        },
                    });
                }
            }
            const scheduler = await prismaClient_1.prisma.scrapingScheduler.findUnique({
                where: { id: schedulerId },
            });
            let nextRun = null;
            if (scheduler?.cron_expression) {
                const interval = cron_parser_1.default.parse(scheduler.cron_expression);
                nextRun = interval.next().toDate();
            }
            await prismaClient_1.prisma.scrapingScheduler.update({
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
    }
    catch (e) {
        if (job.data.id) {
            const instance = await prismaClient_1.prisma.instanceScrape.findFirst({
                where: { id: job.data.id },
            });
            if (instance) {
                await prismaClient_1.prisma.instanceScrapeHistory.create({
                    data: {
                        url: instance.url,
                        response: { error: String(e) },
                        status: "ERROR",
                        instanceScrapeId: instance.id,
                        scrapingSchedulerId: instance.scrapingSchedulerId,
                    },
                });
            }
            await prismaClient_1.prisma.instanceScrape.update({
                where: { id: job.data.id },
                data: {
                    status: "ERROR",
                    last_update: new Date(),
                    response: { error: String(e) },
                },
            });
        }
        if (job.data.schedulerId) {
            await prismaClient_1.prisma.scrapingScheduler.update({
                where: { id: job.data.schedulerId },
                data: {
                    status: "ERROR",
                    update_at: new Date(),
                },
            });
        }
        console.log("Error: ", e);
    }
}, { connection, concurrency: 1 });
