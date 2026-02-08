"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteInstanceScrape = exports.getInstancesScrapeById = exports.getInstancesScrape = exports.createInstanceScrape = void 0;
const prismaClient_1 = require("../config/prismaClient");
const queue_1 = require("../config/queue");
const createInstanceScrape = async (req, res, next) => {
    try {
        const { url, scrapingSchedulerId } = req.body;
        const instanceScrape = await prismaClient_1.prisma.instanceScrape.create({
            data: {
                url: url,
                scrapingSchedulerId: scrapingSchedulerId
                    ? parseInt(scrapingSchedulerId, 10)
                    : undefined,
            },
        });
        if (!scrapingSchedulerId) {
            await queue_1.scrapeQueue.add("scrape-url", {
                id: instanceScrape.id,
            });
        }
        res.status(201).json(instanceScrape);
    }
    catch (error) {
        next(error);
    }
};
exports.createInstanceScrape = createInstanceScrape;
const getInstancesScrape = async (req, res, next) => {
    try {
        const instanceScrapes = await prismaClient_1.prisma.instanceScrape.findMany();
        res.json(instanceScrapes);
    }
    catch (error) {
        next(error);
    }
};
exports.getInstancesScrape = getInstancesScrape;
const getInstancesScrapeById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const instanceScrape = await prismaClient_1.prisma.instanceScrape.findUnique({
            where: {
                id: id,
            },
        });
        if (!instanceScrape) {
            res.status(404).json({ message: "Instance of Scrape not found" });
            return;
        }
        res.json(instanceScrape);
    }
    catch (error) {
        next(error);
    }
};
exports.getInstancesScrapeById = getInstancesScrapeById;
const deleteInstanceScrape = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const deletedInstanceScrape = await prismaClient_1.prisma.instanceScrape.delete({
            where: {
                id: id,
            },
        });
        res.json(deletedInstanceScrape);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteInstanceScrape = deleteInstanceScrape;
