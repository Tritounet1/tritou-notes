import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { createInstance } from "../services/instanceService";

export const createInstanceScrape = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { url, scrapingSchedulerId, scraperId } = req.body;

    const instanceScrape = await createInstance({
      url,
      scrapingSchedulerId: scrapingSchedulerId ? parseInt(scrapingSchedulerId, 10) : undefined,
      scraperId: scraperId ? parseInt(scraperId, 10) : undefined,
    });
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
    const instanceScrapes = await prisma.instanceScrape.findMany({
      include: {
        scraper: { select: { id: true, name: true, display_template: true } },
      },
    });
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
      include: {
        scraper: { select: { id: true, name: true, display_template: true } },
      },
    });
    if (!instanceScrape) {
      res.status(404).json({ message: "Instance de scrape introuvable" });
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
