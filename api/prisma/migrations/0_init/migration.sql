-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('TEXT', 'EXCEL', 'TODO');

-- CreateEnum
CREATE TYPE "ScrapingSchedulerStatus" AS ENUM ('DESACTIVATE', 'RUNNING', 'ERROR', 'ACTIVATE');

-- CreateEnum
CREATE TYPE "InstanceScrapeStatus" AS ENUM ('IN_QUEUE', 'STARTING', 'WORKING', 'FINISHED', 'ERROR');

-- CreateEnum
CREATE TYPE "ScraperStatus" AS ENUM ('ACTIVE', 'DISABLE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" INTEGER NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'TEXT',
    "parentId" INTEGER,
    "folderId" INTEGER,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapingScheduler" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cron_expression" TEXT,
    "start_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "status" "ScrapingSchedulerStatus" NOT NULL DEFAULT 'DESACTIVATE',
    "update_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingScheduler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentHistory" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,

    CONSTRAINT "DocumentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scraper" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "code" TEXT DEFAULT '',
    "browser" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT[],
    "status" "ScraperStatus" NOT NULL DEFAULT 'DISABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "display_template" JSONB,

    CONSTRAINT "Scraper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceScrape" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "response" JSONB,
    "status" "InstanceScrapeStatus" NOT NULL DEFAULT 'IN_QUEUE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scrapingSchedulerId" INTEGER,
    "scraperId" INTEGER,

    CONSTRAINT "InstanceScrape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceScrapeHistory" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "status" "InstanceScrapeStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instanceScrapeId" INTEGER NOT NULL,
    "scrapingSchedulerId" INTEGER,

    CONSTRAINT "InstanceScrapeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nouvelle conversation',
    "documentId" INTEGER,
    "authorId" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissions" (
    "id" SERIAL NOT NULL,
    "modifyScraper" BOOLEAN NOT NULL DEFAULT false,
    "useScraper" BOOLEAN NOT NULL DEFAULT false,
    "modifyScraperStatus" BOOLEAN NOT NULL DEFAULT false,
    "deleteScraper" BOOLEAN NOT NULL DEFAULT false,
    "createDocument" BOOLEAN NOT NULL DEFAULT false,
    "deleteDocument" BOOLEAN NOT NULL DEFAULT false,
    "modifyDocument" BOOLEAN NOT NULL DEFAULT false,
    "useAiChatBot" BOOLEAN NOT NULL DEFAULT false,
    "accessScrapersPage" BOOLEAN NOT NULL DEFAULT false,
    "accessInstancesScrapersPage" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UserPermissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "openrouterApiKey" TEXT,
    "aiTextModel" TEXT,
    "aiImageModel" TEXT,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "mcpTokenHash" TEXT,
    "mcpTokenCreatedAt" TIMESTAMP(3),

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Images" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentImage" (
    "id" UUID NOT NULL,
    "documentId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Document_parentId_idx" ON "Document"("parentId");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Conversation_documentId_idx" ON "Conversation"("documentId");

-- CreateIndex
CREATE INDEX "Conversation_authorId_idx" ON "Conversation"("authorId");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_idx" ON "AiMessage"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissions_userId_key" ON "UserPermissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "DocumentImage_documentId_idx" ON "DocumentImage"("documentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentHistory" ADD CONSTRAINT "DocumentHistory_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceScrape" ADD CONSTRAINT "InstanceScrape_scrapingSchedulerId_fkey" FOREIGN KEY ("scrapingSchedulerId") REFERENCES "ScrapingScheduler"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceScrape" ADD CONSTRAINT "InstanceScrape_scraperId_fkey" FOREIGN KEY ("scraperId") REFERENCES "Scraper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceScrapeHistory" ADD CONSTRAINT "InstanceScrapeHistory_instanceScrapeId_fkey" FOREIGN KEY ("instanceScrapeId") REFERENCES "InstanceScrape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceScrapeHistory" ADD CONSTRAINT "InstanceScrapeHistory_scrapingSchedulerId_fkey" FOREIGN KEY ("scrapingSchedulerId") REFERENCES "ScrapingScheduler"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissions" ADD CONSTRAINT "UserPermissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentImage" ADD CONSTRAINT "DocumentImage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

