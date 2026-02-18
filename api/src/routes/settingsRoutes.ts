import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settingsController";
import { adminMiddleware } from "../middlewares/adminMiddleware";

const router = Router();

router.get("/", adminMiddleware(), getSettings);
router.put("/:id", adminMiddleware(), updateSettings);

export default router;
