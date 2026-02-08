"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("./middlewares/authMiddleware");
const errorHandler_1 = require("./middlewares/errorHandler");
const anthropicClientRoutes_1 = __importDefault(require("./routes/anthropicClientRoutes"));
const authAdminRoutes_1 = __importDefault(require("./routes/authAdminRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const conversationRoutes_1 = __importDefault(require("./routes/conversationRoutes"));
const documentHistoryRoutes_1 = __importDefault(require("./routes/documentHistoryRoutes"));
const documentRoutes_1 = __importDefault(require("./routes/documentRoutes"));
const instanceScrapeHistoryRoutes_1 = __importDefault(require("./routes/instanceScrapeHistoryRoutes"));
const instanceScrapeRoutes_1 = __importDefault(require("./routes/instanceScrapeRoutes"));
const scraperRoutes_1 = __importDefault(require("./routes/scraperRoutes"));
const scrapingSchedulerRoutes_1 = __importDefault(require("./routes/scrapingSchedulerRoutes"));
const userPermissionsRoutes_1 = __importDefault(require("./routes/userPermissionsRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const app = (0, express_1.default)();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
app.use((0, cors_1.default)({
    origin: FRONTEND_URL,
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json());
app.use("/health", (req, res) => res.sendStatus(200));
// Routes for init the first user (admin user) and invitations
app.use("/api/admin-auth", authAdminRoutes_1.default);
// Routes without connection need
app.use("/auth", authRoutes_1.default);
// Auth middleware for check if user is connected
app.use(authMiddleware_1.authHandler);
// Routes with connection need
app.use("/api/documents", documentRoutes_1.default);
app.use("/api/document-histories", documentHistoryRoutes_1.default);
app.use("/api/conversations", conversationRoutes_1.default);
app.use("/api/scrapers", scraperRoutes_1.default);
app.use("/api/instance-scrape", instanceScrapeRoutes_1.default);
app.use("/api/user-permissions", userPermissionsRoutes_1.default);
app.use("/api/ai-client", anthropicClientRoutes_1.default);
app.use("/api/users", userRoutes_1.default);
app.use("/api/scraping-schedulers", scrapingSchedulerRoutes_1.default);
app.use("/api/instance-scrape-histories", instanceScrapeHistoryRoutes_1.default);
// Global error handler (should be after routes)
app.use(errorHandler_1.errorHandler);
exports.default = app;
