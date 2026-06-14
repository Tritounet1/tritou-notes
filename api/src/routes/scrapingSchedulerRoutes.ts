import { Router } from "express";
import {
  createScrapingScheduler,
  deleteScrapingScheduler,
  getScrapingScheduler,
  getScrapingSchedulerById,
  getScrapingSchedulerPreview,
  updateScrapingScheduler,
} from "../controllers/scrapingSchedulerController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("accessScrapersPage"), getScrapingScheduler);
router.get("/:id/preview", requirePermission("accessScrapersPage"), getScrapingSchedulerPreview);
router.get("/:id", requirePermission("accessScrapersPage"), getScrapingSchedulerById);
router.post("/", requirePermission("modifyScraperStatus"), createScrapingScheduler);
router.put("/:id", requirePermission("modifyScraperStatus"), updateScrapingScheduler);
router.delete("/:id", requirePermission("modifyScraperStatus"), deleteScrapingScheduler);

export default router;
