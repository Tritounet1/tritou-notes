"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userPermissionsController_1 = require("../controllers/userPermissionsController");
const router = (0, express_1.Router)();
router.get("/:id", userPermissionsController_1.getUserPermissionsByUserId);
router.put("/:id", userPermissionsController_1.updateUserPermissions);
exports.default = router;
