import cronParser from "cron-parser";
import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { scrapeQueue } from "../config/queue";

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
    const documents = await prisma.scrapingScheduler.findMany();
    res.json(documents);
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

    const previous_scraping_scheduler =
      await prisma.scrapingScheduler.findFirst({
        where: { id: id },
      });

    if (!previous_scraping_scheduler) {
      throw new Error("La Scraping Scheduler n'existe pas");
    }

    const author = await prisma.user.findFirst({ where: { id: req.user.id } });

    if (!author) {
      throw new Error("Utilisateur introuvable");
    }

    // TODO: vérifier si l'user à y accès

    const scrapingScheduler = await prisma.scrapingScheduler.update({
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
    if (
      previous_scraping_scheduler.status !== "ACTIVATE" &&
      scrapingScheduler.status === "ACTIVATE"
    ) {
      if (scrapingScheduler.cron_expression) {
        await scrapeQueue.add(
          jobName,
          { schedulerId: id },
          {
            repeat: {
              pattern: scrapingScheduler.cron_expression,
            },
            jobId: jobName,
          },
        );

        const interval = cronParser.parse(scrapingScheduler.cron_expression);
        const nextRun = interval.next().toDate();

        await prisma.scrapingScheduler.update({
          where: { id },
          data: {
            start_at: scrapingScheduler.start_at || new Date(),
            next_run_at: nextRun,
          },
        });
      }
    }

    if (
      previous_scraping_scheduler.status === "ACTIVATE" &&
      scrapingScheduler.status !== "ACTIVATE"
    ) {
      const repeatableJobs = await scrapeQueue.getRepeatableJobs();
      const jobToRemove = repeatableJobs.find((job) => job.name === jobName);
      if (jobToRemove) {
        await scrapeQueue.removeRepeatableByKey(jobToRemove.key);
      }
      await prisma.scrapingScheduler.update({
        where: { id },
        data: { next_run_at: null },
      });
    }

    res.json(scrapingScheduler);
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
    const deletedScrapingScheduler = await prisma.scrapingScheduler.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedScrapingScheduler);
  } catch (error) {
    next(error);
  }
};
