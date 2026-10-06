import { Router } from "express";
import { createMcpToken, deleteMcpToken, getSettings, updateSettings } from "../controllers/settingsController";
import { adminMiddleware } from "../middlewares/adminMiddleware";

const router = Router();

router.get("/", adminMiddleware(), getSettings);
router.post("/mcp-token", adminMiddleware(), createMcpToken);
router.delete("/mcp-token", adminMiddleware(), deleteMcpToken);
router.put("/:id", adminMiddleware(), updateSettings);

export default router;
