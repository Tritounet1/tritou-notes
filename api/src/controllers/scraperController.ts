import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prismaClient";
import { assertScrapableUrl } from "../scraping/networkGuard";

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
    const { name, description, code, browser, base_url, status, display_template } = req.body;

    const previous_scraper = await prisma.scraper.findFirst({
      where: { id: id },
    });

    if (!previous_scraper) {
      throw new Error("Le scraper n'existe pas");
    }

    // Scraper code runs on the server: only admins may change it.
    if (code !== undefined && code !== (previous_scraper.code ?? "") && req.user?.role !== "ADMIN") {
      res.status(403).json({ message: "Seuls les administrateurs peuvent modifier le code d'un scraper." });
      return;
    }
    if (base_url !== undefined && !Array.isArray(base_url)) {
      res.status(400).json({ message: "base_url doit être une liste d'URL." });
      return;
    }
    (base_url ?? []).forEach((url: string) => assertScrapableUrl(String(url)));

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
        display_template: display_template ?? undefined,
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
