import { Router } from "express";
import { changePassword, login, logout, logoutEverywhere, me } from "../controllers/authController";
import { authHandler } from "../middlewares/authMiddleware";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/logout-everywhere", authHandler, logoutEverywhere);
router.get("/me", authHandler, me);
router.post("/change-password", authHandler, changePassword);

export default router;
