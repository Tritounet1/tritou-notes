import { Router } from "express";
import {
  createInstanceScrape,
  deleteInstanceScrape,
  getInstancesScrape,
  getInstancesScrapeById,
} from "../controllers/instanceScrapeController";

const router = Router();

router.get("/", getInstancesScrape);
router.get("/:id", getInstancesScrapeById);
router.post("/", createInstanceScrape);
router.delete("/:id", deleteInstanceScrape);

export default router;
