import { Router } from "express";
import { getDocumentHistoriesByDocumentId } from "../controllers/documentHistoryController";

const router = Router();

router.get("/:id", getDocumentHistoriesByDocumentId);

export default router;
