import { Router } from "express";
import {
  deleteConversationsByDocumentId,
  getConversations,
  getConversationsByDocumentId,
} from "../controllers/conversationController";

const router = Router();

router.get("/", getConversations);
router.get("/:id", getConversationsByDocumentId);
// router.post("/", createConversation); TODO: don't need cause the conversation is create directly in the send message to model route
router.delete("/:id", deleteConversationsByDocumentId);

export default router;
