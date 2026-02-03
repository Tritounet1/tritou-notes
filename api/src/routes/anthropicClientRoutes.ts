import { Router } from "express";
import {
  getModels,
  sendMessage,
} from "../controllers/anthropicClientController";

const router = Router();

router.get("/", getModels);
router.post("/", sendMessage);

export default router;
