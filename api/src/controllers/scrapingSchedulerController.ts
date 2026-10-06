import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { deleteScheduler, updateScheduler } from "../services/schedulerService";
import { cronRunsAround, recentRuns, RECENT_RUNS } from "../utils/schedulerRuns";

export const createScrapingScheduler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { title, description } = req.body;
    const user = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!user) {
      throw new Error("Utilisateur introuvable");
    }
    // TODO: + Verif if the user have access to this route with his userPermissions

    const scrapingScheduler = await prisma.scrapingScheduler.create({
      data: {
        title: title,
        description: description,
      },
    });
    res.status(201).json(scrapingScheduler);
  } catch (error) {
    next(error);
  }
};

export const getScrapingScheduler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schedulers = await prisma.scrapingScheduler.findMany({
      include: {
        InstanceScrapes: { select: { status: true, last_update: true } },
        instanceScrapeHistories: {
          select: { status: true, created_at: true },
          orderBy: { created_at: "desc" },
          take: RECENT_RUNS,
        },
      },
    });
    const now = new Date();
    res.json(
      schedulers.map(({ InstanceScrapes, instanceScrapeHistories, ...scheduler }) => ({
        ...scheduler,
        recentRuns: recentRuns(InstanceScrapes, instanceScrapeHistories),
        timeline: cronRunsAround(scheduler.cron_expression, now),
      })),
    );
  } catch (error) {
    next(error);
  }
};

export const getScrapingSchedulerById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scrapingScheduler = await prisma.scrapingScheduler.findUnique({
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
  } catch (error) {
    next(error);
  }
};

export const updateScrapingScheduler = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { title, description, status, cron_expression } = req.body;
    res.json(await updateScheduler(id, req.user.id, { title, description, status, cron_expression }));
  } catch (error) {
    next(error);
  }
};

export const getScrapingSchedulerPreview = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scheduler = await prisma.scrapingScheduler.findUnique({
      where: { id },
      include: {
        InstanceScrapes: {
          where: { status: "FINISHED" },
          orderBy: { created_at: "desc" },
          take: 1,
          include: {
            scraper: {
              select: { id: true, name: true, display_template: true },
            },
          },
        },
      },
    });
    if (!scheduler) {
      res.status(404).json({ message: "Scheduler not found" });
      return;
    }
    const latest = scheduler.InstanceScrapes[0] ?? null;
    res.json({
      id: scheduler.id,
      title: scheduler.title,
      description: scheduler.description,
      status: scheduler.status,
      last_run_at: scheduler.last_run_at,
      latestData: latest
        ? { response: latest.response, scraper: latest.scraper }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteScrapingScheduler = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedScrapingScheduler = await deleteScheduler(id);
    res.json(deletedScrapingScheduler);
  } catch (error) {
    next(error);
  }
};
