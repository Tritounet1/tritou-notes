"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteScrapingScheduler = exports.updateScrapingScheduler = exports.getScrapingSchedulerById = exports.getScrapingScheduler = exports.createScrapingScheduler = void 0;
const cron_parser_1 = __importDefault(require("cron-parser"));
const prismaClient_1 = require("../config/prismaClient");
const queue_1 = require("../config/queue");
const createScrapingScheduler = async (req, res, next) => {
    try {
        const { title, description } = req.body;
        const user = await prismaClient_1.prisma.user.findFirst({ where: { id: req.user.id } });
        if (!user) {
            throw new Error("Utilisateur introuvable");
        }
        // TODO: + Verif if the user have access to this route with his userPermissions
        const scrapingScheduler = await prismaClient_1.prisma.scrapingScheduler.create({
            data: {
                title: title,
                description: description,
            },
        });
        res.status(201).json(scrapingScheduler);
    }
    catch (error) {
        next(error);
    }
};
exports.createScrapingScheduler = createScrapingScheduler;
const getScrapingScheduler = async (req, res, next) => {
    try {
        const documents = await prismaClient_1.prisma.scrapingScheduler.findMany();
        res.json(documents);
    }
    catch (error) {
        next(error);
    }
};
exports.getScrapingScheduler = getScrapingScheduler;
const getScrapingSchedulerById = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const scrapingScheduler = await prismaClient_1.prisma.scrapingScheduler.findUnique({
            where: {
                id: id,
            },
            include: {
                InstanceScrapes: {
                    orderBy: {
                        created_at: "desc",
                    },
                },
            },
        });
        if (!scrapingScheduler) {
            res.status(404).json({ message: "Scraping Scheduler not found" });
            return;
        }
        res.json(scrapingScheduler);
    }
    catch (error) {
        next(error);
    }
};
exports.getScrapingSchedulerById = getScrapingSchedulerById;
const updateScrapingScheduler = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { title, description, status, cron_expression } = req.body;
        const previous_scraping_scheduler = await prismaClient_1.prisma.scrapingScheduler.findFirst({
            where: { id: id },
        });
        if (!previous_scraping_scheduler) {
            throw new Error("La Scraping Scheduler n'existe pas");
        }
        const author = await prismaClient_1.prisma.user.findFirst({ where: { id: req.user.id } });
        if (!author) {
            throw new Error("Utilisateur introuvable");
        }
        // TODO: vérifier si l'user à y accès
        const scrapingScheduler = await prismaClient_1.prisma.scrapingScheduler.update({
            where: {
                id: id,
            },
            data: {
                title: title,
                description: description,
                status: status,
                cron_expression: cron_expression,
            },
        });
        const jobName = `scheduler-${id}`;
        // Si on active le scheduler et qu'il y a une cron expression
        if (previous_scraping_scheduler.status !== "ACTIVATE" &&
            scrapingScheduler.status === "ACTIVATE") {
            if (scrapingScheduler.cron_expression) {
                await queue_1.scrapeQueue.add(jobName, { schedulerId: id }, {
                    repeat: {
                        pattern: scrapingScheduler.cron_expression,
                    },
                    jobId: jobName,
                });
                const interval = cron_parser_1.default.parse(scrapingScheduler.cron_expression);
                const nextRun = interval.next().toDate();
                await prismaClient_1.prisma.scrapingScheduler.update({
                    where: { id },
                    data: {
                        start_at: scrapingScheduler.start_at || new Date(),
                        next_run_at: nextRun,
                    },
                });
            }
        }
        if (previous_scraping_scheduler.status === "ACTIVATE" &&
            scrapingScheduler.status !== "ACTIVATE") {
            const repeatableJobs = await queue_1.scrapeQueue.getRepeatableJobs();
            const jobToRemove = repeatableJobs.find((job) => job.name === jobName);
            if (jobToRemove) {
                await queue_1.scrapeQueue.removeRepeatableByKey(jobToRemove.key);
            }
            await prismaClient_1.prisma.scrapingScheduler.update({
                where: { id },
                data: { next_run_at: null },
            });
        }
        res.json(scrapingScheduler);
    }
    catch (error) {
        next(error);
    }
};
exports.updateScrapingScheduler = updateScrapingScheduler;
const deleteScrapingScheduler = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const deletedScrapingScheduler = await prismaClient_1.prisma.scrapingScheduler.delete({
            where: {
                id: id,
            },
        });
        res.json(deletedScrapingScheduler);
    }
    catch (error) {
        next(error);
    }
};
exports.deleteScrapingScheduler = deleteScrapingScheduler;
