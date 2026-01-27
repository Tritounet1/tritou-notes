import cors from "cors";
import express from "express";
import { authHandler } from "./middlewares/authMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import authRoutes from "./routes/authRoutes";
import documentHistoryRoutes from "./routes/documentHistoryRoutes";
import documentRoutes from "./routes/documentRoutes";
import itemRoutes from "./routes/itemRoutes";

const app = express();

app.use(cors());
app.use(express.json());

// Routes without connection need
app.use("/auth", authRoutes);

// Auth middleware for check if user is connected
app.use(authHandler);

// Routes with connection need
app.use("/api/items", itemRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/document-histories", documentHistoryRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;
