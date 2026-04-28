import { Router } from "express";
import { changePassword, login, logout, me } from "../controllers/authController";
import { authHandler } from "../middlewares/authMiddleware";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.get("/me", authHandler, me);
router.post("/change-password", authHandler, changePassword);

export default router;
