"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteScraper = exports.updateScraper = exports.getScraperById = exports.getScrapers = exports.createScraper = void 0;
const prismaClient_1 = require("../config/prismaClient");
const createScraper = async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const scraper = await prismaClient_1.prisma.scraper.create({
            data: {
                name: name,
                description: description,
            },
        });
        res.status(201).json(scraper);
    }
    catch (error) {
        next(error);
    }
};
exports.createScraper = createScraper;
const getScrapers = async (req, res, next) => {
    try {
        const scrapers = await prismaClient_1.prisma.scraper.findMany();
        res.json(scrapers);
    }
    catch (error) {
        next(error);
    }
};
exports.getScrapers = getScrapers;
const getScraperById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const scraper = await prismaClient_1.prisma.scraper.findUnique({
            where: {
                id: id,
            },
        });
        if (!scraper) {
            res.status(404).json({ message: "Scraper not found" });
            return;
        }
        res.json(scraper);
    }
    catch (error) {
        next(error);
    }
};
exports.getScraperById = getScraperById;
const updateScraper = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, description, code, browser, base_url, status } = req.body;
        const previous_scraper = await prismaClient_1.prisma.scraper.findFirst({
            where: { id: id },
        });
        if (!previous_scraper) {
            throw new Error("Le scraper n'existe pas");
        }
        const scraper = await prismaClient_1.prisma.scraper.update({
            where: {
                id: id,
            },
            data: {
                name: name,
                description: description,
                code: code,
                browser: browser,
                base_url: base_url,
                status: status,
                last_update: new Date(),
            },
        });
        res.json(scraper);
    }
    catch (error) {
        next(error);
    }
};
exports.updateScraper = updateScraper;
const deleteScraper = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const deletedScraper = await prismaClient_1.prisma.scraper.delete({
            where: {
                id: id,
            },
        });
        res.json(deletedScraper);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteScraper = deleteScraper;
