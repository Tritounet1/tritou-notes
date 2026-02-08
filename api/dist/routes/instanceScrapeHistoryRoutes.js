"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const instanceScrapeHistoryController_1 = require("../controllers/instanceScrapeHistoryController");
const router = (0, express_1.Router)();
router.get("/", instanceScrapeHistoryController_1.getInstancesScrapeHistory);
router.get("/:id", instanceScrapeHistoryController_1.getInstancesScrapeHistoryByInstanceScrapeId);
exports.default = router;
