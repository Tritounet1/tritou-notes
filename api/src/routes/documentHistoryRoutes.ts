import { Router } from "express";
import {
  getDocumentHistoriesByDocumentId,
  getDocumentsHistories,
} from "../controllers/documentHistoryController";

const router = Router();

router.get("/", getDocumentsHistories);
router.get("/:id", getDocumentHistoriesByDocumentId);

export default router;
