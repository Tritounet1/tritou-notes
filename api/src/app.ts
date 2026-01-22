import express from "express";
import { authHandler } from "./middlewares/authMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import authRoutes from "./routes/authRoutes";
import itemRoutes from "./routes/itemRoutes";

const app = express();

app.use(express.json());

// Routes without connection need
app.use("/auth", authRoutes);

// Auth middleware for check if user is connected
app.use(authHandler);

// Routes with connection need
app.use("/api/items", itemRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;
