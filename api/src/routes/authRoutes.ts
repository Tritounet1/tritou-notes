import { Router } from "express";
import { login, logout, me } from "../controllers/authController";
import { authHandler } from "../middlewares/authMiddleware";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authHandler, me);

export default router;
