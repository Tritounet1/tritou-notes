"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const documentHistoryController_1 = require("../controllers/documentHistoryController");
const router = (0, express_1.Router)();
router.get("/", documentHistoryController_1.getDocumentsHistories);
router.get("/:id", documentHistoryController_1.getDocumentHistoriesByDocumentId);
exports.default = router;
