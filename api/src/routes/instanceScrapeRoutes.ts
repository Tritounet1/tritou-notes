import { Router } from "express";
import {
  createInstanceScrape,
  deleteInstanceScrape,
  getInstancesScrape,
  getInstancesScrapeById,
} from "../controllers/instanceScrapeController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("accessInstancesScrapersPage"), getInstancesScrape);
router.get("/:id", requirePermission("accessInstancesScrapersPage"), getInstancesScrapeById);
router.post("/", requirePermission("useScraper"), createInstanceScrape);
router.delete("/:id", requirePermission("useScraper"), deleteInstanceScrape);

export default router;
