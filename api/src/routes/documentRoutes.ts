import { Router } from "express";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  getDocuments,
  updateDocument,
} from "../controllers/documentController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

const router = Router();

router.get("/", getDocuments);
router.get("/:id", getDocumentById);
router.post("/", requirePermission("createDocument"), createDocument);
router.put("/:id", requirePermission("modifyDocument"), updateDocument);
router.delete("/:id", requirePermission("deleteDocument"), deleteDocument);

export default router;
