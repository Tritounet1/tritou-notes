"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const conversationController_1 = require("../controllers/conversationController");
const router = (0, express_1.Router)();
router.get("/", conversationController_1.getConversations);
router.get("/:id", conversationController_1.getConversationsByDocumentId);
// router.post("/", createConversation); TODO: don't need cause the conversation is create directly in the send message to model route
router.delete("/:id", conversationController_1.deleteConversationsByDocumentId);
exports.default = router;
