import { Router } from "express";
import {
  getInstancesScrapeHistory,
  getInstancesScrapeHistoryByInstanceScrapeId,
} from "../controllers/instanceScrapeHistoryController";

const router = Router();

router.get("/", getInstancesScrapeHistory);
router.get("/:id", getInstancesScrapeHistoryByInstanceScrapeId);

export default router;
