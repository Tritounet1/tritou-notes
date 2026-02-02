import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";

export const createScraper = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, description } = req.body;

    const scraper = await prisma.scraper.create({
      data: {
        name: name,
        description: description,
      },
    });
    res.status(201).json(scraper);
  } catch (error) {
    next(error);
  }
};

export const getScrapers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const scrapers = await prisma.scraper.findMany();
    res.json(scrapers);
  } catch (error) {
    next(error);
  }
};

export const getScraperById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scraper = await prisma.scraper.findUnique({
      where: {
        id: id,
      },
    });
    if (!scraper) {
      res.status(404).json({ message: "Scraper not found" });
      return;
    }
    res.json(scraper);
  } catch (error) {
    next(error);
  }
};

export const updateScraper = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description, code, browser, base_url, status } = req.body;

    const previous_scraper = await prisma.scraper.findFirst({
      where: { id: id },
    });

    if (!previous_scraper) {
      throw new Error("Le scraper n'existe pas");
    }

    const scraper = await prisma.scraper.update({
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
  } catch (error) {
    next(error);
  }
};

export const deleteScraper = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deletedScraper = await prisma.scraper.delete({
      where: {
        id: id,
      },
    });
    res.json(deletedScraper);
  } catch (error) {
    next(error);
  }
};
