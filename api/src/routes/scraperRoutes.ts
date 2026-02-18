import { Router } from "express";
import {
  createScraper,
  deleteScraper,
  getScraperById,
  getScrapers,
  updateScraper,
} from "../controllers/scraperController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("accessScrapersPage"), getScrapers);
router.get("/:id", requirePermission("accessScrapersPage"), getScraperById);
router.post("/", requirePermission("modifyScraper"), createScraper);
router.put("/:id", requirePermission("modifyScraper"), updateScraper);
router.delete("/:id", requirePermission("deleteScraper"), deleteScraper);

export default router;
