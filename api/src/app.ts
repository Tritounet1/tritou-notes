import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import path from "node:path";
import config from "./config/config";
import { prisma } from "./config/prismaClient";
import { authHandler } from "./middlewares/authMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import aiRoutes from "./routes/aiRoutes";
import folderRoutes from "./routes/folderRoutes";
import authAdminRoutes from "./routes/authAdminRoutes";
import authRoutes from "./routes/authRoutes";
import documentHistoryRoutes from "./routes/documentHistoryRoutes";
import documentRoutes from "./routes/documentRoutes";
import instanceScrapeHistoryRoutes from "./routes/instanceScrapeHistoryRoutes";
import instanceScrapeRoutes from "./routes/instanceScrapeRoutes";
import scraperRoutes from "./routes/scraperRoutes";
import scrapingSchedulerRoutes from "./routes/scrapingSchedulerRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import linkPreviewRoutes from "./routes/linkPreviewRoutes";
import userPermissionsRoutes from "./routes/userPermissionsRoutes";
import userRoutes from "./routes/userRoutes";

const app = express();
app.disable("x-powered-by");

// The settings row is a singleton read with findFirst everywhere.
const initAppSettings = async () => {
  if (!(await prisma.settings.findFirst())) await prisma.settings.create({ data: {} });
};

// A database that is not up yet must not crash the process with an unhandled rejection.
initAppSettings().catch((error) => console.error("Could not initialise the settings:", error));

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);

app.use(cookieParser());
// /api/ai parses its own, larger bodies (chat attachments).
app.use(/^(?!\/api\/ai\/)/, express.json());

app.use("/health", (req, res) => res.sendStatus(200));

// Browsers request this path when opening API resources directly, including images.
app.get("/favicon.ico", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/tritou-notes-logo.png"));
});

// Routes for init the first user (admin user) and invitations
app.use("/api/admin-auth", authAdminRoutes);

// Routes without connection needed
app.use("/auth", authRoutes);

// Auth middleware for check if user is connected
app.use(authHandler);

// Routes with connection needed
app.use("/api/documents", documentRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/document-histories", documentHistoryRoutes);
app.use("/api/scrapers", scraperRoutes);
app.use("/api/instance-scrape", instanceScrapeRoutes);
app.use("/api/user-permissions", userPermissionsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/users", userRoutes);
app.use("/api/scraping-schedulers", scrapingSchedulerRoutes);
app.use("/api/instance-scrape-histories", instanceScrapeHistoryRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/link-preview", linkPreviewRoutes);

// Global error handler
app.use(errorHandler);

export default app;
