import { Router } from "express";
import {
  createInstanceScrape,
  getInstancesScrape,
  getInstancesScrapeById,
} from "../controllers/instanceScrapeController";

const router = Router();

router.get("/", getInstancesScrape);
router.get("/:id", getInstancesScrapeById);
router.post("/", createInstanceScrape);

export default router;
