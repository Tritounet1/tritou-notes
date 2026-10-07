import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const getInstancesScrapeHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const instanceScrapes = await prisma.instanceScrapeHistory.findMany();
    res.json(instanceScrapes);
  } catch (error) {
    next(error);
  }
};

export const getInstancesScrapeHistoryByInstanceScrapeId = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const instanceScrape = await prisma.instanceScrapeHistory.findMany({
      where: {
        instanceScrapeId: id,
      },
    });
    res.json(instanceScrape);
  } catch (error) {
    next(error);
  }
};
