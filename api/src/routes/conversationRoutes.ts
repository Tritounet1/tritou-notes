import { Router } from "express";
import {
  deleteConversationsByDocumentId,
  getConversations,
  getConversationsByDocumentId,
} from "../controllers/conversationController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", requirePermission("useAiChatBot"), getConversations);
router.get("/:id", requirePermission("useAiChatBot"), getConversationsByDocumentId);
// router.post("/", createConversation); TODO: don't need cause the conversation is create directly in the send message to model route
router.delete("/:id", requirePermission("useAiChatBot"), deleteConversationsByDocumentId);

export default router;
