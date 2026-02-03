import cors from "cors";
import express from "express";
import { authHandler } from "./middlewares/authMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import anthropicClientRoutes from "./routes/anthropicClientRoutes";
import authAdminRoutes from "./routes/authAdminRoutes";
import authRoutes from "./routes/authRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import documentHistoryRoutes from "./routes/documentHistoryRoutes";
import documentRoutes from "./routes/documentRoutes";
import instanceScrapeRoutes from "./routes/instanceScrapeRoutes";
import scraperRoutes from "./routes/scraperRoutes";
import userPermissionsRoutes from "./routes/userPermissionsRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", (req, res) => res.sendStatus(200));

// Routes for init the first user (admin user)
app.use("/admin-auth", authAdminRoutes);

// Routes without connection need
app.use("/auth", authRoutes);

// Auth middleware for check if user is connected
app.use(authHandler);

// Routes with connection need
app.use("/api/documents", documentRoutes);
app.use("/api/document-histories", documentHistoryRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/scrapers", scraperRoutes);
app.use("/api/instance-scrape", instanceScrapeRoutes);
app.use("/api/user-permissions", userPermissionsRoutes);
app.use("/api/ai-client", anthropicClientRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;
