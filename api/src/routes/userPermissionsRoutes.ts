import { Router } from "express";
import {
  getUserPermissionsByUserId,
  updateUserPermissions,
} from "../controllers/userPermissionsController";
import { adminMiddleware } from "../middlewares/adminMiddleware";

const router = Router();

router.get("/:id", adminMiddleware(), getUserPermissionsByUserId);
router.put("/:id", adminMiddleware(), updateUserPermissions);

export default router;
