import { Router } from "express";
import { createMcpToken, deleteMcpToken, listMcpTokens } from "../controllers/mcpTokenController";

const router = Router();

router.get("/", listMcpTokens);
router.post("/", createMcpToken);
router.delete("/:id", deleteMcpToken);

export default router;
