import { Router } from "express";
import {
  getUserPermissionsByUserId,
  updateUserPermissions,
} from "../controllers/userPermissionsController";

const router = Router();

router.get("/:id", getUserPermissionsByUserId);
router.put("/:id", updateUserPermissions);

export default router;
