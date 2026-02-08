import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { scrapeQueue } from "../config/queue";

export const createInstanceScrape = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { url, scrapingSchedulerId } = req.body;

    const instanceScrape = await prisma.instanceScrape.create({
      data: {
        url: url,
        scrapingSchedulerId: scrapingSchedulerId
          ? parseInt(scrapingSchedulerId, 10)
          : undefined,
      },
    });

    if (!scrapingSchedulerId) {
      await scrapeQueue.add("scrape-url", {
        id: instanceScrape.id,
      });
    }

    res.status(201).json(instanceScrape);
  } catch (error) {
    next(error);
  }
};

export const getInstancesScrape = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const instanceScrapes = await prisma.instanceScrape.findMany();
    res.json(instanceScrapes);
  } catch (error) {
    next(error);
  }
};

export const getInstancesScrapeById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const instanceScrape = await prisma.instanceScrape.findUnique({
      where: {
        id: id,
      },
    });
    if (!instanceScrape) {
      res.status(404).json({ message: "Instance of Scrape not found" });
      return;
    }
    res.json(instanceScrape);
  } catch (error) {
    next(error);
  }
};

export const deleteInstanceScrape = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedInstanceScrape = await prisma.instanceScrape.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedInstanceScrape);
  } catch (error) {
    next(error);
  }
};
