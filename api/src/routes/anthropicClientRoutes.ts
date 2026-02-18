import { Router } from "express";
import {
  getModels,
  sendMessage,
} from "../controllers/anthropicClientController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("useAiChatBot"), getModels);
router.post("/", requirePermission("useAiChatBot"), sendMessage);

export default router;
