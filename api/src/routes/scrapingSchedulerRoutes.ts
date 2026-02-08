import { Router } from "express";
import {
  createScrapingScheduler,
  deleteScrapingScheduler,
  getScrapingScheduler,
  getScrapingSchedulerById,
  updateScrapingScheduler,
} from "../controllers/scrapingSchedulerController";

const router = Router();

router.get("/", getScrapingScheduler);
router.get("/:id", getScrapingSchedulerById);
router.post("/", createScrapingScheduler);
router.put("/:id", updateScrapingScheduler);
router.delete("/:id", deleteScrapingScheduler);

export default router;
