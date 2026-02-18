import { Router } from "express";
import {
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
} from "../controllers/userController";
import { adminMiddleware } from "../middlewares/adminMiddleware";

const router = Router();

router.get("/", adminMiddleware(), getUsers);
router.get("/:id", adminMiddleware(), getUserById);
router.post("/", adminMiddleware(), createUser);
router.put("/:id", adminMiddleware(), updateUser);
router.delete("/:id", adminMiddleware(), deleteUser);

export default router;
