import { Router } from "express";
import {
  getInstancesScrapeHistory,
  getInstancesScrapeHistoryByInstanceScrapeId,
} from "../controllers/instanceScrapeHistoryController";
import { requireAnyPermission } from "../middlewares/permissionsMiddleware";

const router = Router();

// Scrape results: readable from the Instances page or from a scheduler's page.
const canReadResults = requireAnyPermission("accessInstancesScrapersPage", "accessScrapersPage");

router.get("/", canReadResults, getInstancesScrapeHistory);
router.get("/:id", canReadResults, getInstancesScrapeHistoryByInstanceScrapeId);

export default router;
