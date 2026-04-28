import { Router } from "express";
import {
  deleteConversationsByDocumentId,
  getConversations,
  getConversationsByDocumentId,
} from "../controllers/conversationController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("useAiChatBot"), getConversations);
router.get(
  "/:id",
  requirePermission("useAiChatBot"),
  getConversationsByDocumentId,
);
router.delete(
  "/:id",
  requirePermission("useAiChatBot"),
  deleteConversationsByDocumentId,
);

export default router;
