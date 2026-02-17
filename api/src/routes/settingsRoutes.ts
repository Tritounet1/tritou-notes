import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settingsController";

const router = Router();

router.get("/", getSettings);
router.put("/:id", updateSettings);

export default router;
