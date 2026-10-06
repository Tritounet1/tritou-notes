import express, { Router } from "express";
import {
  createConversation,
  deleteConversation,
  generateImage,
  getAiStatus,
  getConversation,
  getModels,
  listConversations,
  renameConversation,
  sendMessage,
} from "../controllers/aiController";
import { adminMiddleware } from "../middlewares/adminMiddleware";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

// Attachments travel as base64 data URLs (5 files × 10 MB max), hence the larger body limit.
router.use(express.json({ limit: "70mb" }));

const canChat = requirePermission("useAiChatBot");

router.get("/status", canChat, getAiStatus);
router.get("/models", adminMiddleware(), getModels);
router.get("/conversations", canChat, listConversations);
router.post("/conversations", canChat, createConversation);
router.get("/conversations/:id", canChat, getConversation);
router.patch("/conversations/:id", canChat, renameConversation);
router.delete("/conversations/:id", canChat, deleteConversation);
router.post("/conversations/:id/messages", canChat, sendMessage);
router.post("/images", requirePermission("useAiChatBot", "modifyDocument"), generateImage);

export default router;
