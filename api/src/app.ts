import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import config from "./config/config";
import { prisma } from "./config/prismaClient";
import { authHandler } from "./middlewares/authMiddleware";
import { errorHandler } from "./middlewares/errorHandler";
import anthropicClientRoutes from "./routes/anthropicClientRoutes";
import authAdminRoutes from "./routes/authAdminRoutes";
import authRoutes from "./routes/authRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import documentHistoryRoutes from "./routes/documentHistoryRoutes";
import documentRoutes from "./routes/documentRoutes";
import instanceScrapeHistoryRoutes from "./routes/instanceScrapeHistoryRoutes";
import instanceScrapeRoutes from "./routes/instanceScrapeRoutes";
import scraperRoutes from "./routes/scraperRoutes";
import scrapingSchedulerRoutes from "./routes/scrapingSchedulerRoutes";
import settingsRoutes from "./routes/settingsRoutes";
import userPermissionsRoutes from "./routes/userPermissionsRoutes";
import userRoutes from "./routes/userRoutes";

const app = express();

const initAppSettings = async () => {
  try {
    await prisma.settings.findFirstOrThrow({
      where: {
        id: 1,
      },
    });
  } catch {
    await prisma.settings.create({
      data: {},
    });
  }
};

initAppSettings();

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json());

app.use("/health", (req, res) => res.sendStatus(200));

// Routes for init the first user (admin user) and invitations
app.use("/api/admin-auth", authAdminRoutes);

// Routes without connection needed
app.use("/auth", authRoutes);

// Auth middleware for check if user is connected
app.use(authHandler);

// Routes with connection needed
app.use("/api/documents", documentRoutes);
app.use("/api/document-histories", documentHistoryRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/scrapers", scraperRoutes);
app.use("/api/instance-scrape", instanceScrapeRoutes);
app.use("/api/user-permissions", userPermissionsRoutes);
app.use("/api/ai-client", anthropicClientRoutes);
app.use("/api/users", userRoutes);
app.use("/api/scraping-schedulers", scrapingSchedulerRoutes);
app.use("/api/instance-scrape-histories", instanceScrapeHistoryRoutes);
app.use("/api/settings", settingsRoutes);

// Global error handler
app.use(errorHandler);

export default app;
