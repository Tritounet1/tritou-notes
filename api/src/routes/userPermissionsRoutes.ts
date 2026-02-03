import { Router } from "express";
import { updateUserPermissions } from "../controllers/userPermissionsController";

const router = Router();

router.put("/:id", updateUserPermissions);

export default router;
