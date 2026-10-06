import { Router } from "express";
import { createFolder, deleteFolder, getFolders, updateFolder } from "../controllers/folderController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

// Folders organise pages, so they follow the document permissions.
router.get("/", getFolders);
router.post("/", requirePermission("createDocument"), createFolder);
router.patch("/:id", requirePermission("modifyDocument"), updateFolder);
router.delete("/:id", requirePermission("deleteDocument"), deleteFolder);

export default router;
