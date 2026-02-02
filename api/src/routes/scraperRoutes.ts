import { Router } from "express";
import {
  createScraper,
  deleteScraper,
  getScraperById,
  getScrapers,
  updateScraper,
} from "../controllers/scraperController";

const router = Router();

router.get("/", getScrapers);
router.get("/:id", getScraperById);
router.post("/", createScraper);
router.put("/:id", updateScraper);
router.delete("/:id", deleteScraper);

export default router;
