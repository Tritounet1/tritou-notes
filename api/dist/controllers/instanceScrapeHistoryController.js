"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstancesScrapeHistoryByInstanceScrapeId = exports.getInstancesScrapeHistory = void 0;
const prismaClient_1 = require("../config/prismaClient");
const getInstancesScrapeHistory = async (req, res, next) => {
    try {
        const instanceScrapes = await prismaClient_1.prisma.instanceScrapeHistory.findMany();
        res.json(instanceScrapes);
    }
    catch (error) {
        next(error);
    }
};
exports.getInstancesScrapeHistory = getInstancesScrapeHistory;
const getInstancesScrapeHistoryByInstanceScrapeId = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const instanceScrape = await prismaClient_1.prisma.instanceScrapeHistory.findMany({
            where: {
                instanceScrapeId: id,
            },
        });
        if (!instanceScrape) {
            res.status(404).json({ message: "Instance of Scrape History not found" });
            return;
        }
        res.json(instanceScrape);
    }
    catch (error) {
        next(error);
    }
};
exports.getInstancesScrapeHistoryByInstanceScrapeId = getInstancesScrapeHistoryByInstanceScrapeId;
