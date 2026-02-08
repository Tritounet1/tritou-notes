"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const anthropicClientController_1 = require("../controllers/anthropicClientController");
const router = (0, express_1.Router)();
router.get("/", anthropicClientController_1.getModels);
router.post("/", anthropicClientController_1.sendMessage);
exports.default = router;
