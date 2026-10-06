import { Router } from "express";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  getDocuments,
  updateDocument,
} from "../controllers/documentController";
import { requirePermission } from "../middlewares/permissionsMiddleware";

import { getDocumentImage, uploadDocumentImage } from "../controllers/documentImageController";
import { documentImageUpload } from "../middlewares/documentImageUpload";

const router = Router();
router.get("/:id/images/:imageId", getDocumentImage);
router.post("/:id/images", requirePermission("modifyDocument"), documentImageUpload, uploadDocumentImage);

router.get("/", getDocuments);
router.get("/:id", getDocumentById);
router.post("/", requirePermission("createDocument"), createDocument);
router.put("/:id", requirePermission("modifyDocument"), updateDocument);
router.delete("/:id", requirePermission("deleteDocument"), deleteDocument);

export default router;
